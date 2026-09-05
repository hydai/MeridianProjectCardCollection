import { Skeleton } from "@/components/ui/skeleton";
import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import PublicViewer from "./PublicViewer";

const Admin = lazy(() => import("./admin/Admin"));
const TradePostPage = lazy(() => import("./TradePostPage"));

function PageSkeleton() {
  return (
    <main className="mx-auto max-w-[920px] px-7 pt-14 pb-24 max-sm:px-4 max-sm:pt-9">
      <output aria-label="載入頁面" className="flex flex-col gap-5">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </output>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<PublicViewer />} />
          <Route path="/exchange/:publicId" element={<TradePostPage />} />
          <Route path="/admin/*" element={<Admin />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
