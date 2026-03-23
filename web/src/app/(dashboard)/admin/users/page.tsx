"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { UserResponse, CreateUserRequest } from "@/lib/types";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function UsersPage() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<UserResponse | null>(null);

  // Create form state
  const [newUser, setNewUser] = useState<CreateUserRequest>({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "User",
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "",
  });

  const loadUsers = async () => {
    try {
      const data = await api.users.list();
      setUsers(data);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.users.create(newUser);
      toast.success("User created successfully");
      setCreateOpen(false);
      setNewUser({ email: "", password: "", firstName: "", lastName: "", role: "User" });
      loadUsers();
    } catch {
      toast.error("Failed to create user");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.users.delete(deleteId);
      toast.success("User deleted");
      setDeleteId(null);
      loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      await api.users.update(editUser.id, editForm);
      toast.success("User updated");
      setEditUser(null);
      loadUsers();
    } catch {
      toast.error("Failed to update user");
    }
  };

  const openEdit = (user: UserResponse) => {
    setEditUser(user);
    setEditForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    });
  };

  return (
    <AuthGuard requiredRole="Admin">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">User Management</h1>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create User
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.firstName} {user.lastName}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "Admin" ? "default" : "secondary"}>{user.role}</Badge>
                  </TableCell>
                  <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(user)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(user.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>Add a new user to the platform.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" value={newUser.firstName} onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" value={newUser.lastName} onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select id="role" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                  <option value="User">User</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button type="submit">Create</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editUser !== null} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>Update user information.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                  <option value="User">User</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" type="button" onClick={() => setEditUser(null)}>Cancel</Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>Are you sure you want to delete this user? This action cannot be undone.</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  );
}
