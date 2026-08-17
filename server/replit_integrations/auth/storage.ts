import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserAvatar(id: string, url: string): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values(userData)
        .onConflictDoUpdate({
          target: users.id,
          set: {
            ...userData,
            updatedAt: new Date(),
          },
        })
        .returning();
      return user;
    } catch (error: any) {
      // Handle email uniqueness conflict: a placeholder user exists with the same email
      // (e.g. admin created a portal-invited-X record before the real user logged in).
      // In this case we update the placeholder's profile data and return it so the
      // login completes. getUserRole() then re-links the contact to the real sub via
      // its email-fallback path.
      if (error.code === "23505") {
        const [existingByEmail] = await db.select().from(users).where(eq(users.email, userData.email!));
        if (existingByEmail) {
          const [updated] = await db
            .update(users)
            .set({
              firstName: userData.firstName ?? existingByEmail.firstName,
              lastName: userData.lastName ?? existingByEmail.lastName,
              profileImageUrl: userData.profileImageUrl ?? existingByEmail.profileImageUrl,
              updatedAt: new Date(),
            })
            .where(eq(users.id, existingByEmail.id))
            .returning();
          return updated;
        }
      }
      throw error;
    }
  }

  async updateUserAvatar(id: string, url: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ customAvatarUrl: url, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
