-- What a task was offered for when it was filed. The Marketing workspace's
-- "New task" form asks for points; a report that never named any keeps null,
-- so its reward stays the agents' estimate average (#rewards). Conversion
-- copies a named value onto the issue's reward. Safe to run again.
ALTER TABLE "Idea" ADD COLUMN IF NOT EXISTS "points" INTEGER;
