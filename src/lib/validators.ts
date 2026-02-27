import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(100, "Password must be at most 100 characters.")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
  .regex(/[a-z]/, "Password must include at least one lowercase letter.")
  .regex(/[0-9]/, "Password must include at least one number.");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(80),
  email: z.string().trim().email("Enter a valid email."),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(1, "Password is required."),
});

export const createRoomSchema = z.object({
  name: z.string().trim().min(2, "Room name is required.").max(100),
  isPrivate: z.boolean().optional().default(false),
});

const baseMessageSchema = z.object({
  content: z.string().max(2000).optional(),
  fileUrl: z.string().max(500).startsWith("/uploads/").optional(),
});

export const sendRoomMessageSchema = baseMessageSchema
  .extend({
    roomId: z.string().uuid(),
  })
  .refine((value) => Boolean(value.content?.trim() || value.fileUrl), {
    message: "Either content or fileUrl is required.",
  });

export const privateMessageSchema = baseMessageSchema
  .extend({
    receiverId: z.string().uuid(),
  })
  .refine((value) => Boolean(value.content?.trim() || value.fileUrl), {
    message: "Either content or fileUrl is required.",
  });

export const messageHistoryQuerySchema = z
  .object({
    roomId: z.string().uuid().optional(),
    receiverId: z.string().uuid().optional(),
    before: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .superRefine((value, context) => {
    const hasRoomId = Boolean(value.roomId);
    const hasReceiverId = Boolean(value.receiverId);

    if (hasRoomId === hasReceiverId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either roomId or receiverId.",
      });
    }
  });
