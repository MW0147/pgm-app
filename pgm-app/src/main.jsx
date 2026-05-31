import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Director from "./pages/Director";
import Camera from "./pages/Camera";
import Home from "./pages/Home";
import Multiviewer from "./pages/Multiviewer";
import AudioConsole from "./pages/Audio";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/director" element={<Director />} />
        <Route path="/camera" element={<Camera />} />
        <Route path="/multiviewer" element={<Multiviewer />} />
        <Route path="/audio" element={<AudioConsole />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
