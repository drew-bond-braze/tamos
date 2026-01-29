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

const normalizeEmailValue = (value) => String(value ?? '').trim().toLowerCase();

// 1. Keep your logic function (Keep it exported if you want to use it elsewhere)
export async function getUser(userEmail) {
  try {
    if (!userEmail) return null;
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = 'users!A:AZ'; 

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return null;

    const headers = rows[0];
    const emailIndex = findHeaderIndex(headers, ['email_address', 'email', 'emailaddress']);

    if (emailIndex === -1) {
      throw new Error("Column 'email' or 'email_address' not found");
    }

    const normalizedEmail = normalizeEmailValue(userEmail);
    const userRow = rows.find(row => normalizeEmailValue(row[emailIndex]) === normalizedEmail);
    if (!userRow) return null;

    return headers.reduce((acc, header, index) => {
      acc[header] = userRow[index] ?? '';
      return acc;
    }, {});
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    throw error; // Throw so the handler can catch it
  }
}

export async function getUsersByTestManager(testManagerValue) {
  try {
    if (!testManagerValue) return [];
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = 'users!A:AZ';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    const headers = rows[0];
    const testManagerIndex = findHeaderIndex(headers, ['testManager', 'test_manager']);
    if (testManagerIndex === -1) {
      throw new Error("Column 'testManager' not found");
    }

    const normalizedTarget = String(testManagerValue ?? '').trim().toLowerCase();
    const matchingRows = rows
      .slice(1)
      .filter((row) => String(row[testManagerIndex] ?? '').trim().toLowerCase() === normalizedTarget);

    return matchingRows.map((row) => (
      headers.reduce((acc, header, index) => {
        acc[header] = row[index] ?? '';
        return acc;
      }, {})
    ));
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    throw error;
  }
}

// 2. The API Handler (This is what Next.js actually runs when you fetch)
export default async function handler(req, res) {
  const { email, testManager } = req.query;

  if (!email && !testManager) {
    return res.status(400).json({ error: 'Email or testManager query parameter is required' });
  }

  try {
    if (testManager) {
      const data = await getUsersByTestManager(testManager);
      return res.status(200).json(data);
    }

    const data = await getUser(email);

    if (!data) {
      return res.status(404).json({ message: 'User not found in sheet' });
    }

    // Return the JSON data to your frontend
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}