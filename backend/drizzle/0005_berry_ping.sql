ALTER TABLE "golden_room_event" ADD COLUMN "kind" text DEFAULT 'room' NOT NULL;--> statement-breakpoint
ALTER TABLE "golden_room_event" ADD COLUMN "client_event_id" uuid;--> statement-breakpoint
ALTER TABLE "tracker_device" ADD COLUMN "client_version" text;--> statement-breakpoint
CREATE UNIQUE INDEX "golden_room_event_client_key" ON "golden_room_event" USING btree ("account_id","client_event_id");--> statement-breakpoint
ALTER TABLE "golden_room_event" ADD CONSTRAINT "golden_room_event_kind" CHECK ("golden_room_event"."kind" IN ('room', 'golden', 'silver'));