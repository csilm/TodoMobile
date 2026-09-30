# Daymark

A personal todo app built with Expo. Tasks, notes, due dates, and priorities are stored locally on your device using SQLite. No account or internet connection is required.

## Get started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the app:

   ```bash
   npx expo start
   ```

Scan the QR code from the Expo CLI with Expo Go to open the app on your phone. Your task list stays on that device and survives app restarts.

## Recurring routines

Open **Recurring routines** to save a task as a daily, weekly (choose a weekday), or monthly (choose a day of the month) routine. Daymark creates a new dated task each time it is due when you open the app or pull to refresh. Monthly dates beyond a month's length use that month's last day. You can edit, pause, resume, or delete a routine; deleting one keeps tasks that were already created.
