export interface TokenResponse {
  access: string;
  access_expires: number;
  refresh: string;
  refresh_expires: number;
}

export interface RefreshResponse {
  access: string;
  access_expires: number;
}

export interface Institution {
  id: string;
  name: string;
  bic?: string;
  transaction_total_days?: string;
  countries?: string[];
  logo?: string;
}

export interface EndUserAgreement {
  id: string;
  created: string;
  max_historical_days: number;
  access_valid_for_days: number;
  access_scope: string[];
  institution_id: string;
}

export type RequisitionStatus =
  | 'CR' // CREATED
  | 'GC' // GIVING_CONSENT
  | 'UA' // UNDERGOING_AUTHENTICATION
  | 'RJ' // REJECTED
  | 'SA' // SELECTING_ACCOUNTS
  | 'GA' // GRANTING_ACCESS
  | 'LN' // LINKED
  | 'EX' // EXPIRED
  | 'SU'; // SUSPENDED

export interface Requisition {
  id: string;
  created: string;
  redirect: string;
  status: RequisitionStatus;
  institution_id: string;
  agreement: string;
  reference: string;
  accounts: string[];
  user_language: string;
  link: string;
}

export interface AccountDetails {
  account: {
    resourceId?: string;
    iban?: string;
    currency?: string;
    ownerName?: string;
    name?: string;
    product?: string;
    cashAccountType?: string;
  };
}

export interface AccountBalance {
  balanceAmount: { amount: string; currency: string };
  balanceType: string; // closingBooked, expected, interimAvailable, ...
  referenceDate?: string;
}

export interface BalancesResponse {
  balances: AccountBalance[];
}

export interface RawTransaction {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount: { amount: string; currency: string };
  creditorName?: string;
  debtorName?: string;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  additionalInformation?: string;
  bankTransactionCode?: string;
  proprietaryBankTransactionCode?: string;
  [key: string]: unknown;
}

export interface TransactionsResponse {
  transactions: {
    booked: RawTransaction[];
    pending: RawTransaction[];
  };
}
