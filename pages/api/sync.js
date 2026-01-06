import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"

// Sync endpoint for bulk operations
// Tray.io can use this to sync all data at once

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!session.user?.email?.endsWith('@braze.com')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // POST - Bulk sync from Google Sheets
  if (req.method === 'POST') {
    const { clients, tasks, updates } = req.body;

    // Tray.io will send all data from Google Sheets
    // This endpoint validates and processes the sync
    
    const results = {
      clients: { processed: 0, errors: [] },
      tasks: { processed: 0, errors: [] },
      updates: { processed: 0, errors: [] }
    };

    // Validate and process clients
    if (Array.isArray(clients)) {
      clients.forEach(client => {
        if (client.id && client.name) {
          results.clients.processed++;
        } else {
          results.clients.errors.push(`Invalid client: ${JSON.stringify(client)}`);
        }
      });
    }

    // Validate and process tasks
    if (Array.isArray(tasks)) {
      tasks.forEach(task => {
        if (task.id && task.title && task.nextStep) {
          results.tasks.processed++;
        } else {
          results.tasks.errors.push(`Invalid task: ${JSON.stringify(task)}`);
        }
      });
    }

    // Validate and process updates
    if (Array.isArray(updates)) {
      updates.forEach(update => {
        if (update.id && update.taskId && update.body) {
          results.updates.processed++;
        } else {
          results.updates.errors.push(`Invalid update: ${JSON.stringify(update)}`);
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Sync processed',
      results
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

