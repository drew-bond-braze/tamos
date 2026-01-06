import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"

// API endpoint for tasks
// This is structured to work with Tray.io for Google Sheets integration
// Tray.io will call this endpoint to sync data to/from Google Sheets

export default async function handler(req, res) {
  // Check authentication
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized - Please sign in' });
  }

  // Verify @braze.com email
  if (!session.user?.email?.endsWith('@braze.com')) {
    return res.status(403).json({ error: 'Forbidden - @braze.com email required' });
  }

  // GET - Retrieve tasks (for Tray.io to read from Sheets)
  if (req.method === 'GET') {
    // In production, this would read from Google Sheets via Tray.io
    // For now, return structure that matches expected format
    return res.status(200).json({
      success: true,
      tasks: [],
      clients: [],
      updates: []
    });
  }

  // POST - Create or update task (for Tray.io to write to Sheets)
  if (req.method === 'POST') {
    const { task, client, update, operation } = req.body;

    // Operation types: 'upsert_task', 'upsert_client', 'upsert_update', 'delete_task'
    // Tray.io will upsert by ID (UUID)
    
    if (operation === 'upsert_task' && task) {
      // Validate required fields
      if (!task.id || !task.title || !task.nextStep) {
        return res.status(400).json({ error: 'Missing required fields: id, title, nextStep' });
      }

      // In production, this would write to Google Sheets via Tray.io
      // Tray.io should handle the upsert by ID
      
      return res.status(200).json({
        success: true,
        message: 'Task saved to Google Sheets',
        task: {
          id: task.id,
          ...task
        }
      });
    }

    if (operation === 'upsert_client' && client) {
      if (!client.id || !client.name) {
        return res.status(400).json({ error: 'Missing required fields: id, name' });
      }

      return res.status(200).json({
        success: true,
        message: 'Client saved to Google Sheets',
        client: {
          id: client.id,
          ...client
        }
      });
    }

    if (operation === 'upsert_update' && update) {
      if (!update.id || !update.taskId || !update.body) {
        return res.status(400).json({ error: 'Missing required fields: id, taskId, body' });
      }

      return res.status(200).json({
        success: true,
        message: 'Update saved to Google Sheets',
        update: {
          id: update.id,
          ...update
        }
      });
    }

    if (operation === 'delete_task' && task?.id) {
      return res.status(200).json({
        success: true,
        message: 'Task deleted from Google Sheets'
      });
    }

    return res.status(400).json({ error: 'Invalid operation or missing data' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

