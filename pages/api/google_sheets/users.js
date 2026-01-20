import { google } from 'googleapis';

// 1. Keep your logic function (Keep it exported if you want to use it elsewhere)
export async function getUser(userEmail) {
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
    const range = 'users!A:Z'; 

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return null;

    const headers = rows[0];
    const emailIndex = headers.indexOf('email_address');

    if (emailIndex === -1) throw new Error("Column 'email_address' not found");

    const userRow = rows.find(row => row[emailIndex] === userEmail);
    if (!userRow) return null;

    return headers.reduce((acc, header, index) => {
      acc[header] = userRow[index];
      return acc;
    }, {});
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    throw error; // Throw so the handler can catch it
  }
}

// 2. The API Handler (This is what Next.js actually runs when you fetch)
export default async function handler(req, res) {
  // Get the email from the query string (?email=...)
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email query parameter is required' });
  }

  try {
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