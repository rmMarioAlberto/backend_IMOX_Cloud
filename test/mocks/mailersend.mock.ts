export const mockMailerSend = {
  email: {
    send: jest.fn().mockResolvedValue({ statusCode: 202 }),
  },
};
