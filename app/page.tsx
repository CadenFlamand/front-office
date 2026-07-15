import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Front Office
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Your fantasy football command center.
          </p>
        </div>

        <Separator />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>League overview</CardTitle>
              <Badge variant="secondary">Coming soon</Badge>
            </div>
            <CardDescription>
              Standings, matchups, and roster tools will show up here.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
