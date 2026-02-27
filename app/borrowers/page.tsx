"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const inputStyle = {
  marginRight: 10,
  padding: "9px 10px",
  border: "1px solid #d9dbe2",
  borderRadius: 10,
  background: "#f4f5f8",
  color: "#22242a",
};

const buttonStyle = {
  padding: "8px 12px",
  border: "1px solid #2a2b31",
  borderRadius: 10,
  background: "#2f3137",
  color: "#fff",
  cursor: "pointer",
};

const dangerButtonStyle = {
  padding: "8px 12px",
  border: "1px solid #7e1f2a",
  borderRadius: 10,
  background: "#9a2232",
  color: "#fff",
  cursor: "pointer",
};

export default function BorrowersPage() {
  const borrowers = useQuery(api.borrowers.list, {});
  const createBorrower = useMutation(api.borrowers.create);
  const removeBorrower = useMutation(api.borrowers.remove);

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");

  async function handleAdd() {
    if (!fullName || !department) return;

    await createBorrower({
      fullName,
      department,
      createdAt: Date.now(),
    });

    setFullName("");
    setDepartment("");
  }

  async function handleDelete(borrowerId: Id<"borrowers">, name: string) {
    const confirmed = window.confirm(
      `Delete borrower "${name}"? Any assigned assets will be returned.`,
    );
    if (!confirmed) return;

    await removeBorrower({ borrowerId });
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Borrowers</h1>

      <div style={{ marginTop: 20 }}>
        <input
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          style={inputStyle}
        />
        <button onClick={handleAdd} style={buttonStyle}>
          Add Borrower
        </button>
      </div>

      <div style={{ marginTop: 30 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Full Name
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Department
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {borrowers?.map((borrower) => (
              <tr key={borrower._id}>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                  {borrower.fullName}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                  {borrower.department}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                  <button
                    onClick={() => handleDelete(borrower._id, borrower.fullName)}
                    style={dangerButtonStyle}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
