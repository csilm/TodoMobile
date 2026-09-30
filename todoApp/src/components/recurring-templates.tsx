import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';

import {
  createTemplate,
  deleteTemplate,
  getNextOccurrence,
  setTemplateEnabled,
  updateTemplate,
  type Priority,
  type Recurrence,
  type RecurringTemplate,
  type TemplateInput,
} from '@/lib/tasks';

const colors = {
  background: '#F5F6F2',
  surface: '#FFFFFF',
  text: '#1C2924',
  secondary: '#77827C',
  border: '#E7EBE6',
  green: '#28624F',
  greenLight: '#E3F0E8',
  red: '#C24F48',
};

const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const shortWeekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const recurrenceOptions: { value: Recurrence; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function todayKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRecurrenceLabel(template: RecurringTemplate) {
  if (template.recurrence === 'daily') return 'Every day';
  if (template.recurrence === 'weekly') {
    return `Every ${weekDays[template.weekday ?? 0]}`;
  }
  return `Monthly · day ${template.monthDay ?? 1}`;
}

function getDateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

type RecurringTemplatesProps = {
  templates: RecurringTemplate[];
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
};

export function RecurringTemplates({ templates, onChanged, onError }: RecurringTemplatesProps) {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecurringTemplate | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [recurrence, setRecurrence] = useState<Recurrence>('daily');
  const [weekday, setWeekday] = useState(new Date().getDay());
  const [monthDay, setMonthDay] = useState(String(new Date().getDate()));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function openForm(template?: RecurringTemplate) {
    setEditingTemplate(template ?? null);
    setTitle(template?.title ?? '');
    setNotes(template?.notes ?? '');
    setPriority(template?.priority ?? 'Normal');
    setRecurrence(template?.recurrence ?? 'daily');
    setWeekday(template?.weekday ?? new Date().getDay());
    setMonthDay(String(template?.monthDay ?? new Date().getDate()));
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;
    Keyboard.dismiss();
    setShowForm(false);
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Add a title for this routine.');
      return;
    }

    const parsedMonthDay = Number(monthDay);
    if (recurrence === 'monthly' && (!Number.isInteger(parsedMonthDay) || parsedMonthDay < 1 || parsedMonthDay > 31)) {
      setFormError('Enter a day from 1 to 31.');
      return;
    }

    const selectedWeekday = recurrence === 'weekly' ? weekday : null;
    const selectedMonthDay = recurrence === 'monthly' ? parsedMonthDay : null;
    let nextDueDate: string;
    try {
      nextDueDate = getNextOccurrence(
        recurrence,
        selectedWeekday,
        selectedMonthDay,
        todayKey()
      );
    } catch (error) {
      setFormError(getErrorMessage(error));
      return;
    }

    const input: TemplateInput = {
      title: trimmedTitle,
      notes: notes.trim(),
      priority,
      recurrence,
      weekday: selectedWeekday,
      monthDay: selectedMonthDay,
      nextDueDate,
    };

    setSaving(true);
    setFormError(null);
    onError(null);
    try {
      if (editingTemplate) {
        await updateTemplate(db, editingTemplate.id, input);
      } else {
        await createTemplate(db, input);
      }
      await onChanged();
      Keyboard.dismiss();
      setShowForm(false);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(template: RecurringTemplate) {
    onError(null);
    try {
      const enabled = !template.enabled;
      const nextDueDate = enabled
        ? getNextOccurrence(
            template.recurrence,
            template.weekday,
            template.monthDay,
            todayKey()
          )
        : template.nextDueDate;
      await setTemplateEnabled(db, template, enabled, nextDueDate);
      await onChanged();
    } catch (error) {
      onError(getErrorMessage(error));
    }
  }

  function confirmDelete(template: RecurringTemplate) {
    Alert.alert(
      'Delete routine?',
      `"${template.title}" will stop repeating. Tasks already created from it will stay in your list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              onError(null);
              try {
                await deleteTemplate(db, template.id);
                await onChanged();
              } catch (error) {
                onError(getErrorMessage(error));
              }
            })();
          },
        },
      ]
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Manage recurring routines, ${templates.length} saved`}
        onPress={() => {
          setShowForm(false);
          setVisible(true);
        }}
        style={({ pressed }) => [styles.entry, pressed && styles.pressed]}>
        <View style={styles.entryIcon}>
          <Text style={styles.entryIconText}>↻</Text>
        </View>
        <View style={styles.entryCopy}>
          <Text style={styles.entryTitle}>Recurring routines</Text>
          <Text style={styles.entrySubtitle}>Let the usual things run themselves.</Text>
        </View>
        <View style={styles.entryAction}>
          <Text style={styles.entryCount}>{templates.length}</Text>
          <Text style={styles.entryChevron}>›</Text>
        </View>
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={() => (showForm ? closeForm() : setVisible(false))}
        transparent
        visible={visible}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Close recurring routines"
            onPress={() => (showForm ? closeForm() : setVisible(false))}
            style={styles.scrim}
          />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.eyebrow}>{showForm ? 'MAKE IT A ROUTINE' : 'YOUR ROUTINES'}</Text>
                <Text style={styles.sheetTitle}>{showForm ? (editingTemplate ? 'Edit routine' : 'New routine') : 'Recurring tasks'}</Text>
              </View>
              {showForm ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={closeForm}
                  style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                  <Text style={styles.closeText}>×</Text>
                </Pressable>
              ) : null}
            </View>

            {showForm ? (
              <ScrollView
                contentContainerStyle={styles.formContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <Text style={styles.inputLabel}>TASK</Text>
                <TextInput
                  autoFocus
                  maxLength={120}
                  onChangeText={setTitle}
                  placeholder="What do you do regularly?"
                  placeholderTextColor="#9AA39D"
                  returnKeyType="next"
                  style={styles.textInput}
                  value={title}
                />
                <Text style={styles.inputLabel}>NOTES <Text style={styles.optionalText}>OPTIONAL</Text></Text>
                <TextInput
                  maxLength={500}
                  multiline
                  onChangeText={setNotes}
                  placeholder="Add a few helpful details..."
                  placeholderTextColor="#9AA39D"
                  style={[styles.textInput, styles.notesInput]}
                  textAlignVertical="top"
                  value={notes}
                />

                <Text style={styles.inputLabel}>REPEAT</Text>
                <View style={styles.choiceRow}>
                  {recurrenceOptions.map((option) => {
                    const selected = recurrence === option.value;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={option.value}
                        onPress={() => setRecurrence(option.value)}
                        style={({ pressed }) => [
                          styles.choiceChip,
                          selected && styles.choiceChipSelected,
                          pressed && styles.pressed,
                        ]}>
                        <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {recurrence === 'weekly' ? (
                  <>
                    <Text style={styles.inputLabel}>DAY OF THE WEEK</Text>
                    <View style={styles.weekdayRow}>
                      {weekDays.map((day, index) => {
                        const selected = weekday === index;
                        return (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={day}
                            accessibilityState={{ selected }}
                            key={day}
                            onPress={() => setWeekday(index)}
                            style={({ pressed }) => [
                              styles.weekdayChip,
                              selected && styles.choiceChipSelected,
                              pressed && styles.pressed,
                            ]}>
                            <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                              {shortWeekDays[index]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}

                {recurrence === 'monthly' ? (
                  <>
                    <Text style={styles.inputLabel}>DAY OF THE MONTH</Text>
                    <TextInput
                      keyboardType="number-pad"
                      maxLength={2}
                      onChangeText={(value) => setMonthDay(value.replace(/[^0-9]/g, ''))}
                      placeholder="1–31"
                      placeholderTextColor="#9AA39D"
                      style={styles.dayInput}
                      value={monthDay}
                    />
                    <Text style={styles.helperText}>
                      If a month is shorter, the task is created on its last day.
                    </Text>
                  </>
                ) : null}

                <Text style={styles.inputLabel}>PRIORITY</Text>
                <View style={styles.choiceRow}>
                  {(['Low', 'Normal', 'High'] as const).map((value) => {
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
                        ]}>
                        <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                          {value}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {formError ? <Text style={styles.formError}>{formError}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => void handleSave()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    (pressed || saving) && styles.pressed,
                  ]}>
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {editingTemplate ? 'Save routine' : 'Create routine'}
                    </Text>
                  )}
                </Pressable>
              </ScrollView>
            ) : (
              <>
                <Text style={styles.intro}>
                  A fresh task is added on each scheduled day when you open the app.
                </Text>
                <ScrollView
                  contentContainerStyle={styles.templateList}
                  showsVerticalScrollIndicator={false}>
                  {templates.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyTitle}>No routines yet</Text>
                      <Text style={styles.emptySubtitle}>
                        Save a task once and Daymark will bring it back on your schedule.
                      </Text>
                    </View>
                  ) : (
                    templates.map((template) => (
                      <View
                        key={template.id}
                        style={[styles.templateCard, !template.enabled && styles.templateCardPaused]}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${template.title}`}
                          onPress={() => openForm(template)}
                          style={({ pressed }) => [styles.templateMain, pressed && styles.pressed]}>
                          <View style={styles.templateTitleRow}>
                            <Text numberOfLines={1} style={styles.templateTitle}>
                              {template.title}
                            </Text>
                            {!template.enabled ? <Text style={styles.pausedBadge}>PAUSED</Text> : null}
                          </View>
                          <Text style={styles.templateSchedule}>{getRecurrenceLabel(template)}</Text>
                          {template.enabled ? (
                            <Text style={styles.templateNext}>
                              Next task · {getDateLabel(template.nextDueDate)}
                            </Text>
                          ) : null}
                        </Pressable>
                        <View style={styles.templateActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={template.enabled ? 'Pause routine' : 'Resume routine'}
                            onPress={() => void handleToggle(template)}
                            style={({ pressed }) => [styles.actionChip, pressed && styles.pressed]}>
                            <Text style={styles.actionText}>{template.enabled ? 'Pause' : 'Resume'}</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Delete routine ${template.title}`}
                            onPress={() => confirmDelete(template)}
                            style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
                            <Text style={styles.removeText}>×</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openForm()}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                  <Text style={styles.primaryButtonText}>+  Create a routine</Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    backgroundColor: colors.surface,
    marginBottom: 24,
  },
  entryIcon: {
    width: 35,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.greenLight,
    marginRight: 11,
  },
  entryIconText: {
    color: colors.green,
    fontSize: 18,
    fontWeight: '600',
  },
  entryCopy: {
    flex: 1,
  },
  entryTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  entrySubtitle: {
    color: colors.secondary,
    fontSize: 10,
    marginTop: 3,
  },
  entryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  entryCount: {
    color: colors.green,
    fontSize: 10,
    fontWeight: '700',
  },
  entryChevron: {
    color: colors.green,
    fontSize: 19,
  },
  pressed: {
    opacity: 0.72,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 28, 22, 0.35)',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    maxHeight: '92%',
    paddingHorizontal: 24,
    paddingTop: 10,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.background,
  },
  handle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    borderRadius: 2,
    backgroundColor: '#D3D9D3',
    marginBottom: 18,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  eyebrow: {
    color: colors.green,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  closeButton: {
    width: 35,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#E9ECE8',
  },
  closeText: {
    color: colors.secondary,
    fontSize: 23,
    lineHeight: 27,
  },
  intro: {
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  templateList: {
    gap: 9,
    paddingBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  emptySubtitle: {
    maxWidth: 250,
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  templateCardPaused: {
    opacity: 0.7,
  },
  templateMain: {
    flex: 1,
    minWidth: 0,
  },
  templateTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  templateTitle: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  templateSchedule: {
    color: colors.green,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  templateNext: {
    color: colors.secondary,
    fontSize: 10,
    marginTop: 3,
  },
  pausedBadge: {
    color: colors.secondary,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  templateActions: {
    alignItems: 'flex-end',
    gap: 4,
    marginLeft: 8,
  },
  actionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.greenLight,
  },
  actionText: {
    color: colors.green,
    fontSize: 10,
    fontWeight: '700',
  },
  removeButton: {
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    color: colors.red,
    fontSize: 19,
    fontWeight: '400',
    lineHeight: 22,
  },
  formContent: {
    paddingBottom: 12,
  },
  inputLabel: {
    color: colors.secondary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  optionalText: {
    color: '#AAB2AC',
    fontSize: 8,
    letterSpacing: 0.5,
  },
  textInput: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 14,
    marginBottom: 16,
  },
  notesInput: {
    minHeight: 70,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  choiceChip: {
    minHeight: 37,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '600',
  },
  choiceTextSelected: {
    color: colors.green,
    fontWeight: '700',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  weekdayChip: {
    width: 37,
    height: 37,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  dayInput: {
    width: 95,
    minHeight: 45,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 14,
    marginBottom: 6,
  },
  helperText: {
    color: colors.secondary,
    fontSize: 10,
    marginBottom: 15,
  },
  formError: {
    color: colors.red,
    fontSize: 12,
    marginBottom: 12,
  },
  primaryButton: {
    minHeight: 51,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.green,
    marginTop: 3,
    marginBottom: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
