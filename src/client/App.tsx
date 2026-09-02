import { BrowserRouter, Route, Routes } from "react-router-dom";
import PublicViewer from "./PublicViewer";
import TradePostPage from "./TradePostPage";
import Admin from "./admin/Admin";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicViewer />} />
        <Route path="/exchange/:publicId" element={<TradePostPage />} />
        <Route path="/admin/*" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}
