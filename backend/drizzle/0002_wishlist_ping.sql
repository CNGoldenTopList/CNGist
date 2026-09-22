DROP INDEX "golden_room_rule_target_key";--> statement-breakpoint
ALTER TABLE "player" ADD COLUMN "ping_disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "golden_room_rule" ADD COLUMN "wishlist_entry_id" integer;--> statement-breakpoint
ALTER TABLE "golden_room_rule" ADD CONSTRAINT "golden_room_rule_wishlist_entry_id_wishlist_entry_id_fk" FOREIGN KEY ("wishlist_entry_id") REFERENCES "public"."wishlist_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "golden_room_rule_target_key" ON "golden_room_rule" USING btree ("map_id","sid","side","room_key") WHERE "golden_room_rule"."wishlist_entry_id" IS NULL;--> statement-breakpoint
ALTER TABLE "golden_room_rule" ADD CONSTRAINT "golden_room_rule_wishlist_entry_id_unique" UNIQUE("wishlist_entry_id");