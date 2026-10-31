ALTER TABLE "events" ADD COLUMN "venueName" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "venueAddress" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "venueIsPrivate" boolean DEFAULT false NOT NULL;