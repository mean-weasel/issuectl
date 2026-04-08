import { NotFoundState } from "@/components/ui/NotFoundState";

export default function NotFound() {
  return (
    <NotFoundState
      title="Page not found"
      message="The page you're looking for doesn't exist or has been moved."
      links={[{ href: "/", label: "Back to Dashboard" }]}
    />
  );
}
