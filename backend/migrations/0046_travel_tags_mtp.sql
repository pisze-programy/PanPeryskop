-- 1) Retire the Sport + Sztuka tags — their events move to Inne.
--    Sport was canonical (seed/core/tags.ts), Sztuka was a custom admin tag.
--    json_group_array preserves array order; unaffected posts are skipped.
UPDATE posts
SET tags = (
  SELECT json_group_array(CASE WHEN value IN ('sport', 'sztuka') THEN 'inne' ELSE value END)
  FROM json_each(posts.tags)
)
WHERE tags IS NOT NULL AND (tags LIKE '%sport%' OR tags LIKE '%sztuka%');

DELETE FROM tag_order WHERE tag_id IN ('sport', 'sztuka');
DELETE FROM admin_tags  WHERE id     IN ('sport', 'sztuka');

-- 2) MTP (Targi Poznańskie) fairs become all-day events: start at 00:00 instead of
--    10:00. Event start lives in posts.created_at; showtimes ['00:00'] is the
--    all-day marker (UNKNOWN_TIME) that the +1h liveness rule never filters.
UPDATE posts SET created_at = created_at - 36000000, showtimes = '["00:00"]'
WHERE external_id LIKE 'mtp-%';