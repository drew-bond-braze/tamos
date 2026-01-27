import { getAccountsByUserId } from "./accounts";
import { getProjectsByUserId } from "./projects";
import { getTasksByUserId } from "./tasks";

const CACHE_TTL_MS = 10 * 60 * 1000;

const getCacheStore = () => {
  if (!global.summarySheetCache) {
    global.summarySheetCache = new Map();
  }
  return global.summarySheetCache;
};

const getCachedEntry = (userId) => {
  const cache = getCacheStore();
  const entry = cache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(userId);
    return null;
  }
  return entry;
};

const setCachedEntry = (userId, data) => {
  const cache = getCacheStore();
  cache.set(userId, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "User ID required" });
  }

  const cached = getCachedEntry(userId);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    res.setHeader("Cache-Control", "private, max-age=0, s-maxage=600, stale-while-revalidate=600");
    return res.status(200).json(cached.data);
  }

  try {
    const [accounts, projects, tasks] = await Promise.all([
      getAccountsByUserId(userId),
      getProjectsByUserId(userId),
      getTasksByUserId(userId)
    ]);

    const data = {
      accounts,
      projects,
      tasks
    };

    setCachedEntry(userId, data);

    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "private, max-age=0, s-maxage=600, stale-while-revalidate=600");
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "Fetch failed" });
  }
}
