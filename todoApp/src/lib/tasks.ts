import type { SQLiteDatabase } from 'expo-sqlite';

export type Priority = 'Low' | 'Normal' | 'High';
export type Recurrence = 'daily' | 'weekly' | 'monthly';

export type Task = {
  id: number;
  title: string;
  notes: string;
  dueDate: string | null;
  priority: Priority;
  completed: boolean;
  templateId: number | null;
};

export type TaskInput = {
  title: string;
  notes: string;
  dueDate: string | null;
  priority: Priority;
};

export type TemplateInput = Pick<TaskInput, 'title' | 'notes' | 'priority'> & {
  recurrence: Recurrence;
  weekday: number | null;
  monthDay: number | null;
  nextDueDate: string;
};

export type RecurringTemplate = {
  id: number;
  title: string;
  notes: string;
  priority: Priority;
  recurrence: Recurrence;
  weekday: number | null;
  monthDay: number | null;
  nextDueDate: string;
  enabled: boolean;
};

type TaskRow = {
  id: number;
  title: string;
  notes: string;
  due_date: string | null;
  priority: Priority;
  completed: number;
  template_id: number | null;
};

type TemplateRow = {
  id: number;
  title: string;
  notes: string;
  priority: Priority;
  recurrence: Recurrence;
  weekday: number | null;
  month_day: number | null;
  next_due_date: string;
  enabled: number;
};

type TableColumn = {
  name: string;
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function monthDate(year: number, month: number, day: number) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return dateKey(new Date(year, month, Math.min(day, lastDay)));
}

export function getNextOccurrence(
  recurrence: Recurrence,
  weekday: number | null,
  monthDay: number | null,
  fromDate: string
) {
  if (recurrence === 'daily') return fromDate;

  const date = dateFromKey(fromDate);
  if (recurrence === 'weekly') {
    if (weekday === null || weekday < 0 || weekday > 6) {
      throw new Error('Choose a day of the week for this template.');
    }
    const daysUntil = (weekday - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + daysUntil);
    return dateKey(date);
  }

  if (monthDay === null || monthDay < 1 || monthDay > 31) {
    throw new Error('Choose a day of the month for this template.');
  }
  const thisMonth = monthDate(date.getFullYear(), date.getMonth(), monthDay);
  if (thisMonth >= fromDate) return thisMonth;
  return monthDate(date.getFullYear(), date.getMonth() + 1, monthDay);
}

function getFollowingOccurrence(template: RecurringTemplate, currentDate: string) {
  if (template.recurrence === 'daily') {
    const next = dateFromKey(currentDate);
    next.setDate(next.getDate() + 1);
    return dateKey(next);
  }

  if (template.recurrence === 'weekly') {
    const next = dateFromKey(currentDate);
    next.setDate(next.getDate() + 7);
    return dateKey(next);
  }

  const current = dateFromKey(currentDate);
  return monthDate(current.getFullYear(), current.getMonth() + 1, template.monthDay ?? 1);
}

export async function initializeTasksDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'Normal',
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      template_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS recurring_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'Normal',
      recurrence TEXT NOT NULL,
      weekday INTEGER,
      month_day INTEGER,
      next_due_date TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  const taskColumns = await db.getAllAsync<TableColumn>('PRAGMA table_info(tasks)');
  if (!taskColumns.some((column) => column.name === 'template_id')) {
    await db.execAsync('ALTER TABLE tasks ADD COLUMN template_id INTEGER');
  }

  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS tasks_template_due_date
    ON tasks (template_id, due_date)
    WHERE template_id IS NOT NULL;
  `);
}

export async function readTasks(db: SQLiteDatabase): Promise<Task[]> {
  const rows = await db.getAllAsync<TaskRow>(`
    SELECT id, title, notes, due_date, priority, completed, template_id
    FROM tasks
    ORDER BY completed ASC,
      CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
      due_date ASC,
      id DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueDate: row.due_date,
    priority: row.priority,
    completed: row.completed === 1,
    templateId: row.template_id,
  }));
}

export async function createTask(db: SQLiteDatabase, task: TaskInput) {
  await db.runAsync(
    `INSERT INTO tasks (title, notes, due_date, priority, created_at, template_id)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    task.title,
    task.notes,
    task.dueDate,
    task.priority,
    new Date().toISOString()
  );
}

export async function updateTask(db: SQLiteDatabase, id: number, task: TaskInput) {
  await db.runAsync(
    `UPDATE tasks
     SET title = ?, notes = ?, due_date = ?, priority = ?
     WHERE id = ?`,
    task.title,
    task.notes,
    task.dueDate,
    task.priority,
    id
  );
}

export async function setTaskCompleted(db: SQLiteDatabase, id: number, completed: boolean) {
  await db.runAsync('UPDATE tasks SET completed = ? WHERE id = ?', completed ? 1 : 0, id);
}

export async function deleteTask(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM tasks WHERE id = ?', id);
}

export async function readTemplates(db: SQLiteDatabase): Promise<RecurringTemplate[]> {
  const rows = await db.getAllAsync<TemplateRow>(`
    SELECT id, title, notes, priority, recurrence, weekday, month_day, next_due_date, enabled
    FROM recurring_templates
    ORDER BY enabled DESC, title COLLATE NOCASE ASC
  `);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    notes: row.notes,
    priority: row.priority,
    recurrence: row.recurrence,
    weekday: row.weekday,
    monthDay: row.month_day,
    nextDueDate: row.next_due_date,
    enabled: row.enabled === 1,
  }));
}

export async function createTemplate(db: SQLiteDatabase, template: TemplateInput) {
  await db.runAsync(
    `INSERT INTO recurring_templates
      (title, notes, priority, recurrence, weekday, month_day, next_due_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    template.title,
    template.notes,
    template.priority,
    template.recurrence,
    template.weekday,
    template.monthDay,
    template.nextDueDate,
    new Date().toISOString()
  );
}

export async function updateTemplate(db: SQLiteDatabase, id: number, template: TemplateInput) {
  await db.runAsync(
    `UPDATE recurring_templates
     SET title = ?, notes = ?, priority = ?, recurrence = ?, weekday = ?,
       month_day = ?, next_due_date = ?
     WHERE id = ?`,
    template.title,
    template.notes,
    template.priority,
    template.recurrence,
    template.weekday,
    template.monthDay,
    template.nextDueDate,
    id
  );
}

export async function setTemplateEnabled(
  db: SQLiteDatabase,
  template: RecurringTemplate,
  enabled: boolean,
  nextDueDate: string
) {
  await db.runAsync(
    'UPDATE recurring_templates SET enabled = ?, next_due_date = ? WHERE id = ?',
    enabled ? 1 : 0,
    nextDueDate,
    template.id
  );
}

export async function deleteTemplate(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM recurring_templates WHERE id = ?', id);
}

export async function generateDueTemplateTasks(db: SQLiteDatabase, today: string) {
  await db.withTransactionAsync(async () => {
    const templates = await db.getAllAsync<TemplateRow>(`
      SELECT id, title, notes, priority, recurrence, weekday, month_day,
        next_due_date, enabled
      FROM recurring_templates
      WHERE enabled = 1 AND next_due_date <= ?
      ORDER BY next_due_date ASC, id ASC
    `, today);

    for (const row of templates) {
      const template: RecurringTemplate = {
        id: row.id,
        title: row.title,
        notes: row.notes,
        priority: row.priority,
        recurrence: row.recurrence,
        weekday: row.weekday,
        monthDay: row.month_day,
        nextDueDate: row.next_due_date,
        enabled: row.enabled === 1,
      };
      let dueDate = template.nextDueDate;

      while (dueDate <= today) {
        await db.runAsync(
          `INSERT OR IGNORE INTO tasks
            (title, notes, due_date, priority, completed, created_at, template_id)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
          template.title,
          template.notes,
          dueDate,
          template.priority,
          new Date().toISOString(),
          template.id
        );
        dueDate = getFollowingOccurrence(template, dueDate);
      }

      await db.runAsync(
        'UPDATE recurring_templates SET next_due_date = ? WHERE id = ?',
        dueDate,
        template.id
      );
    }
  });
}
