import { BrowserRouter, Route, Routes } from "react-router-dom";
import PublicViewer from "./PublicViewer";
import Admin from "./admin/Admin";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicViewer />} />
        <Route path="/admin/*" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}
