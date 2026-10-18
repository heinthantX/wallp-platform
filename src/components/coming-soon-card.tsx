import * as React from "react";
import Link from "next/link";
import { Sparkles, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ComingSoonCard({
  title,
  phase,
  description,
}: {
  title: string;
  phase: number;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-4 text-center">
      <Card className="w-full max-w-md border-dashed">
        <CardHeader className="flex flex-col items-center pb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
            <Sparkles className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription className="text-sm">
            Coming in phase {phase}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pt-2">
          <p className="text-sm text-muted-foreground">
            {description ||
              `The ${title} module is scheduled for implementation in phase ${phase} of the wallp dashboard roadmap.`}
          </p>
          <Button variant="outline" asChild className="gap-2">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Overview</span>
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
