export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  OPERATOR = 'OPERATOR',
}

export enum LeadStatus {
  NEW = 'NEW',
  CALLING = 'CALLING',
  BOOKED = 'BOOKED',
  FOLLOW_UP = 'FOLLOW_UP',
  NO_ANSWER = 'NO_ANSWER',
  CLOSED = 'CLOSED',
  DUPLICATE = 'DUPLICATE',
}

export enum AssignmentAlgorithm {
  ROUND_ROBIN = 'ROUND_ROBIN',
  LEAST_BUSY = 'LEAST_BUSY',
  MANUAL = 'MANUAL',
  VIP = 'VIP',
}

export enum CallResult {
  ANSWERED = 'ANSWERED',
  NO_ANSWER = 'NO_ANSWER',
  BUSY = 'BUSY',
  FAILED = 'FAILED',
}
