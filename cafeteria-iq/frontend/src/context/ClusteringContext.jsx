import React, { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { clustering } from "../services/api";

const Ctx = createContext(null);
const so = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

export function ClusteringProvider({ children }) {
  const [activeRun, setActiveRun] = useState(null);
  const [activeClusters, setActiveClusters] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    clustering.getActive().then((r) => {
      if (r.data) {
        setActiveRun(r.data);
        setActiveClusters(r.data.clusters || []);
      }
    });
    const s = io(so, { transports: ["websocket", "polling"] });
    s.on("clustering:started", () => {
      setIsRunning(true);
    });
    s.on("clustering:progress", (m) => setProgress(m));
    s.on("clustering:complete", (m) => {
      setIsRunning(false);
      setProgress(null);
      if (m && m.runId) {
        setActiveRun((prev) => ({ ...prev, runId: m.runId, algorithm: m.algorithm }));
      }
    });
    s.on("clustering:error", () => setIsRunning(false));
    return () => s.close();
  }, []);

  const runClustering = async (algorithm, params) => {
    setIsRunning(true);
    setProgress({ stage: "start", message: "Starting…" });
    try {
      const r = await clustering.run({ algorithm, params: params || {} });
      return r.data;
    } catch (e) {
      setIsRunning(false);
      throw e;
    }
  };

  return (
    <Ctx.Provider
      value={{
        activeRun,
        activeClusters,
        isRunning: isRunning,
        runClustering,
        setActiveRun,
        progress,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useClustering() {
  return useContext(Ctx);
}
