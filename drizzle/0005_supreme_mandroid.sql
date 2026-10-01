CREATE TABLE "prayer_assignments" (
	"request_id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"assignee_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prayer_participants" (
	"meeting_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prayer_participants_meeting_id_user_id_pk" PRIMARY KEY("meeting_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "prayer_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"include_name" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prayer_sessions" (
	"meeting_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"started_by" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"drawn_by" text,
	"drawn_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "prayer_assignments" ADD CONSTRAINT "prayer_assignments_request_id_prayer_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."prayer_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_assignments" ADD CONSTRAINT "prayer_assignments_meeting_id_prayer_sessions_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."prayer_sessions"("meeting_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_assignments" ADD CONSTRAINT "prayer_assignments_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_participants" ADD CONSTRAINT "prayer_participants_meeting_id_prayer_sessions_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."prayer_sessions"("meeting_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_participants" ADD CONSTRAINT "prayer_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_meeting_id_prayer_sessions_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."prayer_sessions"("meeting_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_sessions" ADD CONSTRAINT "prayer_sessions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_sessions" ADD CONSTRAINT "prayer_sessions_started_by_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_sessions" ADD CONSTRAINT "prayer_sessions_drawn_by_user_id_fk" FOREIGN KEY ("drawn_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prayer_assignments_one_per_assignee" ON "prayer_assignments" USING btree ("meeting_id","assignee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prayer_requests_one_per_author" ON "prayer_requests" USING btree ("meeting_id","author_id");