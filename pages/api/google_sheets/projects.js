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
  name: ['name', 'projectname', 'project'],
  projectname: ['name', 'project'],
  accountid: ['accountid', 'account_id', 'tamunitid'],
  accountname: ['accountname', 'account_name', 'tamunitname'],
  tamunitid: ['accountid'],
  tamunitname: ['accountname'],
  userid: ['userid', 'user_id'],
  useremail: ['useremail', 'user_email', 'email'],
  userfirstname: ['userfirstname', 'first_name', 'firstname', 'givenname'],
  userlastname: ['userlastname', 'last_name', 'lastname', 'familyname'],
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

const getProjectSheetHeaders = async (sheets, spreadsheetId) => {
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'projects!1:1'
  });
  const headers = headerResponse.data.values?.[0] || [];
  if (headers.length === 0) {
    throw new Error('No headers found in projects sheet');
  }
  return headers;
};

const buildRowValues = (headers, projectData) => {
  const normalizedProjectData = buildNormalizedRecord(projectData);
  return headers.map((header) => (
    formatCellValue(resolveHeaderValue(header, normalizedProjectData))
  ));
};

export async function getProjectsByUserId(userId) {
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
    const range = 'projects!A:Z';

    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = response.data.values;
    if (!rows || rows.length <= 1) return [];

    const headers = rows[0];
    const ownerIndex = findHeaderIndex(headers, ['userId', 'user_id']);
    if (ownerIndex === -1) {
      throw new Error("Column 'userId' not found in projects sheet");
    }

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
    console.error('Error fetching sheet accounts:', error);
    throw error;
  }
}

export async function addProject(projectData) {
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

    const headers = await getProjectSheetHeaders(sheets, spreadsheetId);
    const rowValues = buildRowValues(headers, projectData);

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'projects!A:Z',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowValues],
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error appending project:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    try {
      const data = await getProjectsByUserId(userId);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: 'Fetch failed' });
    }
  } 

  if (req.method === 'POST') {
    try {
      const projectData = req.body;
      if (!projectData || typeof projectData !== 'object') {
        return res.status(400).json({ error: 'Project payload required' });
      }
      const result = await addProject(projectData);
      return res.status(200).json({ success: true, result });
    } catch (error) {
      return res.status(500).json({ error: 'Write failed', details: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}