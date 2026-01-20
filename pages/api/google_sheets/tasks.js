import { google } from 'googleapis';

export async function getTasksById(userId) {
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
    const range = 'tasks!A:Z'; // Assuming your sheet is named 'tasks'

    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = response.data.values;
    if (!rows || rows.length <= 1) return [];

    const headers = rows[0];
    const ownerIndex = headers.indexOf('userId'); // Ensure this matches your column header

    // Filter rows where owner matches the email
    const userTasks = rows.slice(1).filter(row => row[ownerIndex] === userId);

    // Map rows to objects based on headers
    return userTasks.map(row => {
      return headers.reduce((acc, header, index) => {
        acc[header] = row[index];
        return acc;
      }, {});
    });
  } catch (error) {
    console.error('Error fetching sheet tasks:', error);
    throw error;
  }
}

export async function addTask(taskData) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // 1. Define the order of columns to match your Sheet headers exactly
    // Example order: id, user_id, title, status, priority, dueDate, createdAt
    const rowValues = [
      taskData.id,
      taskData.user_id,
      taskData.title,
      taskData.status,
      taskData.priority,
      taskData.dueDate,
      new Date().toISOString() // createdAt timestamp
    ];

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'tasks!A:Z',
      valueInputOption: 'USER_ENTERED', // Interprets strings like dates or formulas
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowValues],
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error appending task:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID required' });
    try {
      const data = await getTasksById(id);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: 'Fetch failed' });
    }
  } 
  
  if (req.method === 'POST') {
    try {
      const taskData = req.body;
      const result = await addTask(taskData);
      return res.status(200).json({ success: true, result });
    } catch (error) {
      return res.status(500).json({ error: 'Write failed', details: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}