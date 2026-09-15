ALTER TABLE "submission" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- 按当前正式 Tier 回填已有记录；保留其审核结论、隐藏与软删除状态。
UPDATE "submission" AS s SET "verified" = true
FROM "challenge" AS c JOIN "tier" AS t ON t."code" = c."tier_code"
WHERE s."challenge_id" = c."id" AND t."is_official" = true;
