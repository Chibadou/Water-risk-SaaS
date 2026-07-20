import { Suspense } from "react";
import HomeClient from "@/components/HomeClient";

// useSearchParams (deep links from the dashboard) requires a Suspense boundary.
export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
