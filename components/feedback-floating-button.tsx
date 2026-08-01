"use client";

import { MessageSquarePlus } from "lucide-react";

import { BetaFeedbackForm } from "@/components/beta-feedback-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Mounted once in the root layout so it's reachable from every page without
// navigating away — reuses the exact same BetaFeedbackForm as /feedback,
// not a second copy of the form logic.
export function FeedbackFloatingButton() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            className="fixed right-4 bottom-4 z-40 gap-1.5 rounded-full shadow-lg sm:right-6 sm:bottom-6"
            size="lg"
          >
            <MessageSquarePlus className="size-4" />
            Feedback
          </Button>
        }
      />
      <DialogContent>
        <DialogTitle>Beta feedback</DialogTitle>
        <DialogDescription>
          Tell us what&apos;s working, what&apos;s not, or what you&apos;d want to see next.
        </DialogDescription>
        <div className="mt-4">
          <BetaFeedbackForm />
        </div>
      </DialogContent>
    </Dialog>
  );
}
