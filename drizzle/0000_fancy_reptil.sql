CREATE TABLE "apple_connection" (
	"user_id" text PRIMARY KEY NOT NULL,
	"music_user_token" text NOT NULL,
	"storefront" text NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match" (
	"user_id" text NOT NULL,
	"video_id" text NOT NULL,
	"run_id" text,
	"source_playlist_id" text NOT NULL,
	"source_playlist_title" text NOT NULL,
	"playlist_item_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"channel" text NOT NULL,
	"duration_seconds" integer,
	"thumbnail_url" text,
	"query" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"confidence" integer,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_candidate_id" text,
	"apple_song_id" text,
	"outcome" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "match_user_id_video_id_pk" PRIMARY KEY("user_id","video_id")
);
--> statement-breakpoint
CREATE TABLE "match_run" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_playlist_id" text NOT NULL,
	"source_playlist_title" text NOT NULL,
	"target_playlist_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"remove_from_source" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "pinned_playlist" (
	"user_id" text NOT NULL,
	"service" text NOT NULL,
	"playlist_id" text NOT NULL,
	"pinned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pinned_playlist_user_id_service_playlist_id_pk" PRIMARY KEY("user_id","service","playlist_id")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apple_connection" ADD CONSTRAINT "apple_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_run_id_match_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."match_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_run" ADD CONSTRAINT "match_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pinned_playlist" ADD CONSTRAINT "pinned_playlist_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");