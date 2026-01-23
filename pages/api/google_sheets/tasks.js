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
  name: ['title', 'taskname', 'task', 'summary'],
  taskname: ['title', 'name', 'task'],
  task: ['title', 'taskname', 'name'],
  details: ['description', 'notes', 'detail'],
  description: ['description', 'details', 'notes'],
  category: ['category', 'type'],
  iniative: ['initiative', 'program', 'initiative'],
  nextstep: ['nextstep', 'next_step', 'lastupdatesummary', 'description', 'details'],
  priority: ['priority', 'prio'],
  status: ['status', 'state'],
  accountid: ['accountid', 'tamunitid', 'account'],
  accountname: ['accountname', 'tamunitname', 'account'],
  tamunitid: ['accountid'],
  tamunitname: ['accountname'],
  projectid: ['projectid', 'project'],
  projectname: ['projectname'],
  dueat: ['dueat', 'duedate', 'due', 'targetdate', 'date'],
  date: ['dueat', 'duedate', 'due', 'targetdate'],
  duedate: ['dueat', 'date', 'targetdate'],
  due: ['dueat', 'duedate', 'targetdate', 'date'],
  targetdate: ['dueat', 'duedate', 'due', 'date'],
  userid: ['userid', 'user_id', 'ownerid', 'owner_id', 'updateduserid'],
  useremail: ['useremail', 'user_email', 'email', 'owner'],
  userfirstname: ['userfirstname', 'firstname', 'first_name', 'givenname'],
  userlastname: ['userlastname', 'lastname', 'last_name', 'familyname'],
  ownerid: ['userid'],
  assignedto: ['owner', 'assignee'],
  assignee: ['owner', 'assignedto'],
  owner: ['owner', 'assignee', 'assignedto', 'useremail'],
  completed: ['completed', 'done', 'isdone'],
  createdat: ['createdat', 'createddate'],
  updatedat: ['updatedat', 'updateddate', 'lastupdateat'],
  lastupdateat: ['updatedat'],
  lastupdatesummary: ['description', 'notes'],
  updateduserid: ['updateduserid', 'updatedby', 'updateduser', 'userid']
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

  if (normalizedHeader === 'createdat' || normalizedHeader === 'createddate') {
    return new Date().toISOString();
  }

  if (normalizedHeader === 'updatedat' || normalizedHeader === 'updateddate') {
    return new Date().toISOString();
  }

  return '';
};

export async function getTasksByUserId(userId) {
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
    const ownerIndex = findHeaderIndex(headers, ['userId', 'user_id', 'ownerId', 'owner_id']);
    if (ownerIndex === -1) {
      throw new Error("Column 'userId' not found in tasks sheet");
    }

    // Filter rows where owner matches the email
    const userTasks = rows.slice(1).filter(row => String(row[ownerIndex]) === String(userId));

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


// TODO:
// -- ADD TASK
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

    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'tasks!1:1'
    });
    const headers = headerResponse.data.values?.[0] || [];
    if (headers.length === 0) {
      throw new Error('No headers found in tasks sheet');
    }

    const normalizedTaskData = buildNormalizedRecord(taskData);
    const rowValues = headers.map((header) => (
      formatCellValue(resolveHeaderValue(header, normalizedTaskData))
    ));

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

// TODO:
// -- UPDATE TASK

// TODO:
// -- DELETE TASK
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    try {
      const data = await getTasksByUserId(userId);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: 'Fetch failed' });
    }
  } 
  
  if (req.method === 'POST') {
    try {
      const taskData = req.body;
      if (!taskData || typeof taskData !== 'object') {
        return res.status(400).json({ error: 'Task payload required' });
      }
      const result = await addTask(taskData);
      return res.status(200).json({ success: true, result });
    } catch (error) {
      return res.status(500).json({ error: 'Write failed', details: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}