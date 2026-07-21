import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import {
  ArrowRight,
  CalendarDays,
  Sparkles,
  UsersRound,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { CrewLogo } from "@/components/brand/crew-logo";

/**
 * Public marketing / landing page. Operational, dispatch-ready tone.
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <CrewLogo />
          <nav className="flex items-center gap-2">
            <SignedOut>
              <Button asChild variant="ghost">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/sign-up">Get started</Link>
              </Button>
            </SignedOut>
            <SignedIn>
              <Button asChild>
                <Link href="/dashboard">
                  Open dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </SignedIn>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="container flex flex-col items-center py-20 text-center sm:py-24">
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Smart scheduling for the trades
          </span>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Stop playing calendar Tetris with your crew.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            {APP_NAME} suggests who, when, and where for the week — flags
            overbooking, skill gaps, and availability — so you approve a plan
            instead of rebuilding it from texts and spreadsheets.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-in">Owner sign in</Link>
            </Button>
          </div>
        </section>

        <section className="container grid gap-6 pb-24 md:grid-cols-3">
          {[
            {
              icon: CalendarDays,
              title: "Board + week view",
              body: "See unscheduled work and confirmed placements. Assign times and crew without a full Gantt tool.",
            },
            {
              icon: UsersRound,
              title: "Right crew, right job",
              body: "Skills, certifications, rates, and availability drive matching — not guesswork from memory.",
            },
            {
              icon: ShieldAlert,
              title: "Conflicts before chaos",
              body: "Overbooking, skill mismatches, and PTO are surfaced on save. AI proposes; you confirm.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border bg-card p-6 text-left shadow-sm"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        {APP_NAME} · RainCode AI · Built for contractors
      </footer>
    </div>
  );
}
