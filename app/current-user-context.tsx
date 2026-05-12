"use client";

import { createContext, useContext } from "react";

export type CurrentUser = {
  displayName: string;
  username: string;
  role?: string;
  department?: string;
  section?: string;
};

const CurrentUserContext = createContext<CurrentUser | null>(null);

export function CurrentUserProvider({
  children,
  currentUser,
}: {
  children: React.ReactNode;
  currentUser: CurrentUser | null;
}) {
  return (
    <CurrentUserContext.Provider value={currentUser}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
