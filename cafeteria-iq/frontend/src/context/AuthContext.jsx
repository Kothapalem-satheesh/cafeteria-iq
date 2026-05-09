import React, { createContext, useContext, useEffect, useState } from "react";
import { auth as a } from "../services/api";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const isAuthenticated = Boolean(token);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    a
      .getMe()
      .then((r) => setUser(r.data.user))
      .catch(() => {
        setToken(null);
        localStorage.removeItem("token");
      });
  }, [token]);

  const login = async (email, password) => {
    let r;
    try {
      r = await a.login({ email, password });
    } catch (e) {
      e.isNetwork = !e.response;
      e.status = e.response?.status;
      throw e;
    }
    const t = r.data.token;
    setToken(t);
    localStorage.setItem("token", t);
    setUser(r.data.user);
    return r.data;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("token");
  };

  return (
    <Ctx.Provider value={{ user, token, login, logout, isAuthenticated }}>{children}</Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
