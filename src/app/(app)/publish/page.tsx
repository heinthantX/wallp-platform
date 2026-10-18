import { ComingSoonCard } from "@/components/coming-soon-card";

export default function PublishPage() {
  return (
    <ComingSoonCard
      title="Release & Publishing"
      phase={4}
      description="Run pre-flight catalog verification checks, deploy new releases to the CDN, schedule releases, and perform one-click rollbacks."
    />
  );
}
