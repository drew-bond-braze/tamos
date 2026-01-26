import { google } from 'googleapis';

const normalizeKey = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const buildNormalizedRecord = (record = {}) => (
  Object.entries(record).reduce((acc, [key, value]) => {
    acc[normalizeKey(key)] = value;
    return acc;
  }, {})
);

const HEADER_ALIASES = {
  id: ['id'],
  taskid: ['taskid', 'task_id'],
  accountid: ['accountid', 'account_id', 'tamunitid'],
  projectid: ['projectid', 'project_id'],
  note: ['note', 'body', 'message'],
  category: ['category', 'type'],
  userid: ['userid', 'user_id'],
  username: ['username', 'user_name', 'author'],
  createdat: ['createdat', 'created_at', 'createddate'],
  updatedat: ['updatedat', 'updated_at', 'updateddate'],
  updateduserid: ['updateduserid', 'updated_user_id', 'updatedby']
};

const findHeaderIndex = (headers, candidates) => {
  const normalizedHeaders = headers.map(normalizeKey);
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeKey(candidate);
    const index = normalizedHeaders.indexOf(normalizedCandidate);
    if (index !== -1) return index;
  }
  return -1;
};

const formatCellValue = (value) => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
};

const resolveHeaderValue = (header, normalizedData) => {
  const normalizedHeader = normalizeKey(header);
  if (!normalizedHeader) return '';

  if (Object.prototype.hasOwnProperty.call(normalizedData, normalizedHeader)) {
    return normalizedData[normalizedHeader];
  }

  const aliases = HEADER_ALIASES[normalizedHeader];
  if (aliases) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeKey(alias);
      if (Object.prototype.hasOwnProperty.call(normalizedData, normalizedAlias)) {
        return normalizedData[normalizedAlias];
      }
    }
  }

  if (normalizedHeader === 'createdat') {
    return new Date().toISOString();
  }

  if (normalizedHeader === 'updatedat') {
    return new Date().toISOString();
  }

  return '';
};

const getUpdateSheetHeaders = async (sheets, spreadsheetId) => {
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'updates!1:1'
  });
  const headers = headerResponse.data.values?.[0] || [];
  if (headers.length === 0) {
    throw new Error('No headers found in updates sheet');
  }
  return headers;
};

const buildRowValues = (headers, updateData) => {
  const normalizedUpdateData = buildNormalizedRecord(updateData);
  return headers.map((header) => (
    formatCellValue(resolveHeaderValue(header, normalizedUpdateData))
  ));
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

export async function addUpdate(updateData) {
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

    const headers = await getUpdateSheetHeaders(sheets, spreadsheetId);
    const rowValues = buildRowValues(headers, updateData);

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'updates!A:Z',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowValues],
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error appending update:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { taskId } = req.query;
    if (!taskId) return res.status(400).json({ error: 'Task ID required' });

    try {
      const data = await getUpdatesByTaskId(taskId);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: 'Fetch failed', details: error.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const updateData = req.body;
      if (!updateData || typeof updateData !== 'object') {
        return res.status(400).json({ error: 'Update payload required' });
      }
      const result = await addUpdate(updateData);
      return res.status(200).json({ success: true, result });
    } catch (error) {
      return res.status(500).json({ error: 'Write failed', details: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
