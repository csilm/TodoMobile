import { RecurringTemplates } from "@/components/recurring-templates";
import {
  createTask,
  deleteTask,
  generateDueTemplateTasks,
  readTasks,
  readTemplates,
  setTaskCompleted,
  updateTask,
  type Priority,
  type RecurringTemplate,
  type Task,
  type TaskInput,
} from "@/lib/tasks";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const colors = {
  background: "#F5F6F2",
  surface: "#FFFFFF",
  text: "#1C2924",
  secondary: "#77827C",
  border: "#E7EBE6",
  green: "#28624F",
  greenLight: "#E3F0E8",
  darkGreen: "#173D32",
  orange: "#C7773D",
  red: "#C24F48",
  transparent: "transparent",
};

type TaskFilter = "all" | "open" | "done";

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDueLabel(value: string | null) {
  if (!value) return null;

  const today = getDateKey(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = getDateKey(tomorrowDate);
  if (value < today) return "Overdue";
  if (value === today) return "Today";
  if (value === tomorrow) return "Tomorrow";

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function TaskCard({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const dueLabel = getDueLabel(task.dueDate);
  const overdue = dueLabel === "Overdue" && !task.completed;
  const priorityColor =
    task.priority === "High"
      ? colors.red
      : task.priority === "Low"
        ? colors.secondary
        : colors.orange;

  return (
    <View style={[styles.taskCard, task.completed && styles.completedTaskCard]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${task.completed ? "Mark" : "Complete"} ${task.title}`}
        accessibilityState={{ checked: task.completed }}
        onPress={() => onToggle(task)}
        style={({ pressed }) => [
          styles.checkbox,
          task.completed && styles.checkboxChecked,
          pressed && styles.pressed,
        ]}
      >
        {task.completed ? <Text style={styles.checkmark}>✓</Text> : null}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${task.title}`}
        onPress={() => onEdit(task)}
        style={({ pressed }) => [styles.taskDetails, pressed && styles.pressed]}
      >
        <Text
          numberOfLines={1}
          style={[styles.taskTitle, task.completed && styles.completedTitle]}
        >
          {task.title}
        </Text>
        {task.notes ? (
          <Text numberOfLines={1} style={styles.taskNotes}>
            {task.notes}
          </Text>
        ) : null}
        <View style={styles.taskMeta}>
          <View
            style={[styles.priorityDot, { backgroundColor: priorityColor }]}
          />
          <Text style={styles.taskMetaText}>{task.priority}</Text>
          {dueLabel ? (
            <>
              <View style={styles.metaDivider} />
              <Text
                style={[styles.taskMetaText, overdue && styles.overdueText]}
              >
                {dueLabel}
              </Text>
            </>
          ) : null}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${task.title}`}
        onPress={() => onDelete(task)}
        style={({ pressed }) => [
          styles.deleteButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.deleteIcon}>×</Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>("Normal");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadTasks = useCallback(async () => {
    await generateDueTemplateTasks(db, getDateKey(new Date()));
    const [storedTasks, storedTemplates] = await Promise.all([
      readTasks(db),
      readTemplates(db),
    ]);
    setTasks(storedTasks);
    setTemplates(storedTemplates);
  }, [db]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await generateDueTemplateTasks(db, getDateKey(new Date()));
        const [storedTasks, storedTemplates] = await Promise.all([
          readTasks(db),
          readTemplates(db),
        ]);
        if (active) {
          setTasks(storedTasks);
          setTemplates(storedTemplates);
        }
      } catch (error) {
        if (active) setErrorMessage(getErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [db]);

  const today = getDateKey(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = getDateKey(tomorrowDate);
  const completedCount = tasks.filter((task) => task.completed).length;
  const openCount = tasks.length - completedCount;
  const progress = tasks.length === 0 ? 0 : completedCount / tasks.length;

  const filteredTasks = useMemo(() => {
    if (filter === "open") return tasks.filter((task) => !task.completed);
    if (filter === "done") return tasks.filter((task) => task.completed);
    return tasks;
  }, [filter, tasks]);

  const dateHeading = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  function openEditor(task?: Task) {
    setEditingTask(task ?? null);
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    setDueDate(task?.dueDate ?? today);
    setPriority(task?.priority ?? "Normal");
    setFormError(null);
    setEditorVisible(true);
  }

  function closeEditor() {
    if (saving) return;
    Keyboard.dismiss();
    setEditorVisible(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    setErrorMessage(null);
    try {
      await loadTasks();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleToggle(task: Task) {
    setErrorMessage(null);
    try {
      await setTaskCompleted(db, task.id, !task.completed);
      await loadTasks();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  function confirmDelete(task: Task) {
    Alert.alert(
      "Delete task?",
      `"${task.title}" will be removed from your list.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setErrorMessage(null);
              try {
                await deleteTask(db, task.id);
                await loadTasks();
              } catch (error) {
                setErrorMessage(getErrorMessage(error));
              }
            })();
          },
        },
      ],
    );
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("Add a short title for your task.");
      return;
    }

    const input: TaskInput = {
      title: trimmedTitle,
      notes: notes.trim(),
      dueDate,
      priority,
    };

    setSaving(true);
    setFormError(null);
    setErrorMessage(null);
    try {
      if (editingTask) {
        await updateTask(db, editingTask.id, input);
      } else {
        await createTask(db, input);
      }
      await loadTasks();
      Keyboard.dismiss();
      setEditorVisible(false);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const filterOptions: { key: TaskFilter; label: string; count: number }[] = [
    { key: "open", label: "To do", count: openCount },
    { key: "done", label: "Done", count: completedCount },
    { key: "all", label: "All", count: tasks.length },
  ];

  const dueDateOptions: { label: string; value: string | null }[] = [
    { label: "Today", value: today },
    { label: "Tomorrow", value: tomorrow },
    { label: "No date", value: null },
  ];

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              onRefresh={() => void handleRefresh()}
              refreshing={refreshing}
              tintColor={colors.green}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Image
                  source={require("../../assets/images/Monemtum.png")}
                  style={styles.brandLogo}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.brandName}>MOMENTUM</Text>
              <View style={styles.localBadge}>
                <View style={styles.localDot} />
                <Text style={styles.localBadgeText}>ON DEVICE</Text>
              </View>
            </View>
            <Text style={styles.dateHeading}>{dateHeading.toUpperCase()}</Text>
            <Text style={styles.headline}>
              Make room{"\n"}for what matters.
            </Text>
            <Text style={styles.subheadline}>
              One thing at a time. You’ve got this.
            </Text>
          </View>

          <View style={styles.progressCard}>
            <View style={styles.progressTop}>
              <View>
                <Text style={styles.progressEyebrow}>YOUR MOMENTUM</Text>
                <Text style={styles.progressTitle}>
                  {openCount === 0 && tasks.length > 0
                    ? "All caught up"
                    : `${openCount} ${openCount === 1 ? "task" : "tasks"} to go`}
                </Text>
              </View>
              <View style={styles.progressCount}>
                <Text style={styles.progressCountValue}>{completedCount}</Text>
                <Text style={styles.progressCountDivider}>/</Text>
                <Text style={styles.progressCountTotal}>{tasks.length}</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${progress * 100}%` }]}
              />
            </View>
            <Text style={styles.progressCaption}>
              {tasks.length === 0
                ? "Add a task to get your day started."
                : `${Math.round(progress * 100)}% of your list complete`}
            </Text>
          </View>

          <RecurringTemplates
            templates={templates}
            onChanged={loadTasks}
            onError={setErrorMessage}
          />

          <View style={styles.listHeader}>
            <View>
              <Text style={styles.sectionTitle}>Your tasks</Text>
              <Text style={styles.sectionSubtitle}>
                Keep your next steps close.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a task"
              onPress={() => openEditor()}
              style={({ pressed }) => [
                styles.smallAddButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.smallAddText}>+</Text>
            </Pressable>
          </View>

          <View style={styles.filters}>
            {filterOptions.map((option) => {
              const selected = filter === option.key;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.key}
                  onPress={() => setFilter(option.key)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    selected && styles.filterChipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      selected && styles.filterTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.filterCount,
                      selected && styles.filterCountSelected,
                    ]}
                  >
                    {option.count}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void handleRefresh()}
              >
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.green} />
              <Text style={styles.emptySubtitle}>Loading your tasks…</Text>
            </View>
          ) : filteredTasks.length > 0 ? (
            <View style={styles.taskList}>
              {filteredTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  onEdit={openEditor}
                  onDelete={confirmDelete}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Text style={styles.emptyIconText}>
                  {filter === "done" ? "✓" : "＋"}
                </Text>
              </View>
              <Text style={styles.emptyTitle}>
                {filter === "done"
                  ? "Nothing completed yet"
                  : filter === "open" && tasks.length > 0
                    ? "You’re all caught up"
                    : "Start with one small thing"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {filter === "done"
                  ? "Finished tasks will be waiting for you here."
                  : filter === "open" && tasks.length > 0
                    ? "Enjoy the breathing room. You’ve earned it."
                    : "Add a task and make your next step clear."}
              </Text>
              {filter !== "done" && openCount === 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openEditor()}
                  style={({ pressed }) => [
                    styles.emptyAddButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.emptyAddText}>Create a task</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => openEditor()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonPlus}>+</Text>
            <Text style={styles.primaryButtonText}>Add a task</Text>
          </Pressable>
          <Text style={styles.footerNote}>A little progress adds up.</Text>
        </View>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={closeEditor}
        transparent
        visible={editorVisible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalRoot}
        >
          <Pressable
            accessibilityLabel="Close task editor"
            onPress={closeEditor}
            style={styles.modalScrim}
          />
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 24) },
            ]}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>
                  {editingTask ? "MAKE A CHANGE" : "A NEW START"}
                </Text>
                <Text style={styles.sheetTitle}>
                  {editingTask ? "Edit task" : "New task"}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={closeEditor}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.inputLabel}>TASK</Text>
              <TextInput
                autoFocus
                maxLength={120}
                onChangeText={setTitle}
                onSubmitEditing={() => Keyboard.dismiss()}
                placeholder="What needs to get done?"
                placeholderTextColor="#9AA39D"
                returnKeyType="done"
                style={styles.titleInput}
                value={title}
              />
              <Text style={styles.inputLabel}>
                NOTES <Text style={styles.optionalText}>OPTIONAL</Text>
              </Text>
              <TextInput
                maxLength={500}
                multiline
                onChangeText={setNotes}
                placeholder="Add a few helpful details..."
                placeholderTextColor="#9AA39D"
                style={[styles.titleInput, styles.notesInput]}
                textAlignVertical="top"
                value={notes}
              />

              <Text style={styles.inputLabel}>WHEN</Text>
              <View style={styles.choiceRow}>
                {dueDateOptions.map((option) => {
                  const selected = dueDate === option.value;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={option.label}
                      onPress={() => setDueDate(option.value)}
                      style={({ pressed }) => [
                        styles.choiceChip,
                        selected && styles.choiceChipSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          selected && styles.choiceTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.inputLabel}>PRIORITY</Text>
              <View style={styles.choiceRow}>
                {(["Low", "Normal", "High"] as const).map((value) => {
                  const selected = priority === value;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={value}
                      onPress={() => setPriority(value)}
                      style={({ pressed }) => [
                        styles.choiceChip,
                        selected && styles.choiceChipSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          selected && styles.choiceTextSelected,
                        ]}
                      >
                        {value}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {formError ? (
                <Text style={styles.formError}>{formError}</Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void handleSave()}
                style={({ pressed }) => [
                  styles.saveButton,
                  (pressed || saving) && styles.primaryButtonPressed,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingTask ? "Save changes" : "Add to my tasks"}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
    alignSelf: "center",
    width: "100%",
    maxWidth: 620,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  header: {
    paddingTop: 8,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 32,
  },
  brandMark: {
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.transparent,
    marginRight: 9,
  },
  brandMarkText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 25,
  },
  brandLogo: {
    width: "100%",
    height: "100%",
  },
  brandName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  localBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: "auto",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.greenLight,
  },
  localDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green,
    marginRight: 6,
  },
  localBadgeText: {
    color: colors.green,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  dateHeading: {
    color: colors.green,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  headline: {
    color: colors.text,
    fontSize: 37,
    fontWeight: "700",
    letterSpacing: -1.5,
    lineHeight: 42,
    marginTop: 9,
  },
  subheadline: {
    color: colors.secondary,
    fontSize: 14,
    marginTop: 8,
    marginBottom: 23,
  },
  progressCard: {
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.darkGreen,
    marginBottom: 29,
  },
  progressTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressEyebrow: {
    color: "#B7D1C3",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  progressTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  progressCount: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  progressCountValue: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
  },
  progressCountDivider: {
    color: "#8BA99A",
    fontSize: 15,
    marginHorizontal: 3,
  },
  progressCountTotal: {
    color: "#B7D1C3",
    fontSize: 15,
    fontWeight: "600",
  },
  progressTrack: {
    height: 5,
    overflow: "hidden",
    borderRadius: 3,
    backgroundColor: "#3D5D50",
    marginTop: 17,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#A9D5B8",
  },
  progressCaption: {
    color: "#B7D1C3",
    fontSize: 11,
    marginTop: 9,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 17,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  sectionSubtitle: {
    color: colors.secondary,
    fontSize: 12,
    marginTop: 4,
  },
  smallAddButton: {
    height: 38,
    width: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: colors.greenLight,
  },
  smallAddText: {
    color: colors.green,
    fontSize: 25,
    fontWeight: "400",
    lineHeight: 29,
  },
  filters: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 15,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#ECEFEB",
  },
  filterChipSelected: {
    backgroundColor: colors.green,
  },
  filterText: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "600",
  },
  filterTextSelected: {
    color: "#FFFFFF",
  },
  filterCount: {
    color: "#929C96",
    fontSize: 10,
    fontWeight: "700",
    marginLeft: 6,
  },
  filterCountSelected: {
    color: "#D5E8DC",
  },
  taskList: {
    gap: 9,
  },
  taskCard: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  completedTaskCard: {
    backgroundColor: "#F9FAF8",
  },
  checkbox: {
    height: 23,
    width: 23,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#C5CEC8",
    marginRight: 12,
  },
  checkboxChecked: {
    borderColor: colors.green,
    backgroundColor: colors.green,
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 17,
  },
  taskDetails: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  taskTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  completedTitle: {
    color: "#9AA39D",
    textDecorationLine: "line-through",
  },
  taskNotes: {
    color: colors.secondary,
    fontSize: 11,
    marginTop: 3,
  },
  taskMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 7,
  },
  priorityDot: {
    height: 6,
    width: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  taskMetaText: {
    color: colors.secondary,
    fontSize: 10,
    fontWeight: "500",
  },
  metaDivider: {
    height: 3,
    width: 3,
    borderRadius: 2,
    backgroundColor: "#BCC4BE",
    marginHorizontal: 7,
  },
  overdueText: {
    color: colors.red,
    fontWeight: "700",
  },
  deleteButton: {
    width: 30,
    height: 38,
    alignItems: "flex-end",
    justifyContent: "center",
    marginLeft: 8,
  },
  deleteIcon: {
    color: "#A7B0AA",
    fontSize: 24,
    fontWeight: "300",
    lineHeight: 27,
  },
  pressed: {
    opacity: 0.72,
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 36,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: colors.greenLight,
    marginBottom: 13,
  },
  emptyIconText: {
    color: colors.green,
    fontSize: 23,
    fontWeight: "500",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
  },
  emptyAddButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.green,
    marginTop: 15,
  },
  emptyAddText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  loadingState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#FCE9E7",
    marginBottom: 12,
  },
  errorText: {
    color: colors.red,
    flex: 1,
    fontSize: 12,
    marginRight: 10,
  },
  retryText: {
    color: colors.red,
    fontSize: 12,
    fontWeight: "700",
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 10,
    backgroundColor: colors.background,
  },
  primaryButton: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: colors.green,
  },
  primaryButtonPressed: {
    opacity: 0.86,
  },
  primaryButtonPlus: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "400",
    lineHeight: 27,
    marginRight: 9,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  footerNote: {
    color: "#929C96",
    fontSize: 10,
    textAlign: "center",
    marginTop: 9,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 28, 22, 0.35)",
  },
  modalScrim: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    maxHeight: "92%",
    paddingHorizontal: 24,
    paddingTop: 10,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.background,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    alignSelf: "center",
    borderRadius: 2,
    backgroundColor: "#D3D9D3",
    marginBottom: 18,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 19,
  },
  sheetEyebrow: {
    color: colors.green,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  closeButton: {
    width: 35,
    height: 35,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#E9ECE8",
  },
  closeButtonText: {
    color: colors.secondary,
    fontSize: 23,
    lineHeight: 27,
  },
  formContent: {
    paddingBottom: 12,
  },
  inputLabel: {
    color: colors.secondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
  },
  optionalText: {
    color: "#AAB2AC",
    fontSize: 8,
    letterSpacing: 0.5,
  },
  titleInput: {
    minHeight: 49,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 14,
    marginBottom: 17,
  },
  notesInput: {
    minHeight: 76,
  },
  choiceRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 19,
  },
  choiceChip: {
    minHeight: 37,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  choiceChipSelected: {
    borderColor: colors.green,
    backgroundColor: colors.greenLight,
  },
  choiceText: {
    color: colors.secondary,
    fontSize: 11,
    fontWeight: "600",
  },
  choiceTextSelected: {
    color: colors.green,
    fontWeight: "700",
  },
  formError: {
    color: colors.red,
    fontSize: 12,
    marginBottom: 12,
  },
  saveButton: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: colors.green,
    marginTop: 2,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
