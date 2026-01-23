import { google } from 'googleapis';

const normalizeKey = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const findHeaderIndex = (headers, candidates) => {
  const normalizedHeaders = headers.map(normalizeKey);
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeKey(candidate);
    const index = normalizedHeaders.indexOf(normalizedCandidate);
    if (index !== -1) return index;
  }
  return -1;
};

export async function getUpdatesByTaskId(taskId) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = 'updates!A:Z';

    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = response.data.values;
    if (!rows || rows.length <= 1) return [];

    const headers = rows[0];
    const taskIdIndex = findHeaderIndex(headers, ['taskId', 'task_id']);
    if (taskIdIndex === -1) {
      throw new Error("Column 'taskId' not found in updates sheet");
    }

    const taskUpdates = rows.slice(1).filter(row => String(row[taskIdIndex]) === String(taskId));

    return taskUpdates.map(row => {
      return headers.reduce((acc, header, index) => {
        acc[header] = row[index];
        return acc;
      }, {});
    });
  } catch (error) {
    console.error('Error fetching sheet updates:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { taskId } = req.query;
  if (!taskId) return res.status(400).json({ error: 'Task ID required' });

  try {
    const data = await getUpdatesByTaskId(taskId);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Fetch failed', details: error.message });
  }
}
