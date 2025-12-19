import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authentication
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized - Please sign in' });
  }

  // Verify @braze.com email
  if (!session.user?.email?.endsWith('@braze.com')) {
    return res.status(403).json({ error: 'Forbidden - @braze.com email required' });
  }

  // Process the health score submission
  const { formData } = req.body;

  // Here you would typically save to a database
  // For now, we'll just return success
  // In production, replace this with actual database storage
  
  return res.status(200).json({ 
    success: true, 
    message: 'Health score submitted successfully',
    submissionId: `sub_${Date.now()}` 
  });
}

