import type { SampleDoc } from './types'

// All people, organisations, numbers and addresses below are fictional.

export const samples: SampleDoc[] = [
  {
    id: 'lab-report',
    title: 'Blood test report',
    kind: 'Lab report',
    text: `NORTHVALE MEDICAL LABORATORY
14 Juniper Row, Block C, Riverside District, Cairo 11511
Tel: +20 2 2345 6789

PATIENT REPORT: BLOOD COUNT AND METABOLIC PANEL

Patient name: Samira Noor Haddad
Date of birth: 14 March 1984
MRN: 448812
Sex: Female
Patient phone: +20 100 123 4567
Referring doctor: Dr. Karim Adel Mansour
Requesting clinic: Lakeview Family Health Clinic, 9 Palm Avenue, Maadi
Sample collected: 03 November 2026, 08:15
Report issued: 04 November 2026

TEST                 RESULT        REFERENCE RANGE    FLAG
Haemoglobin          10.9 g/dL     12.0 - 15.5        LOW
White blood cells    6.8 x10^9/L   4.0 - 11.0
Platelets            250 x10^9/L   150 - 400
Fasting glucose      5.4 mmol/L    3.9 - 5.5
Ferritin             9 ug/L        15 - 150           LOW
Creatinine           71 umol/L     53 - 97
ALT                  58 U/L        7 - 40             HIGH
Vitamin D (25-OH)    22 nmol/L     50 - 125           LOW

Comment: Results to be reviewed with your doctor. Repeat the ferritin test in 8 weeks.
Please bring this report to your next appointment at the clinic.`,
  },
  {
    id: 'rental-agreement',
    title: 'Rental agreement excerpt',
    kind: 'Tenancy contract',
    text: `RESIDENTIAL TENANCY AGREEMENT (EXCERPT)

This agreement is made on 1 September 2026 between:

Landlord: Omar Tarek Fawzy, National ID 29003151234567, of 22 Lotus Street, Heliopolis, Cairo.
Tenant: Lina Mahmoud Serag, National ID 30107081122334, phone +20 111 555 0198, email lina.serag@example.com.

1. Property. Flat 4, 17 Acacia Road, Nasr City, Cairo, including one parking space.

2. Rent. The monthly rent is EGP 12,500, payable in advance by the 1st of each month to IBAN EG00 1234 5678 9012 3456 7890 1234 at Cairo Commercial Bank, in the name of Omar Tarek Fawzy.

3. Late fee. If rent is paid more than five days late, the tenant pays a late fee of 10% of the monthly rent for each week or part of a week of delay, without limit.

4. Deposit. The tenant pays a deposit equal to two months' rent. It is refundable within 30 days after move-out, less any deductions.

5. Termination. Either party may end this agreement with 60 days' notice. The landlord may also end the agreement at any time, without notice, if he decides to sell the property or move a family member into it.

6. Maintenance. The tenant pays for all repairs, including repairs caused by normal wear and structural defects.

Signed: ____________________ (Landlord)     ____________________ (Tenant)`,
  },
  {
    id: 'bank-letter',
    title: 'Overdrawn account letter',
    kind: 'Bank letter',
    text: `Northgate Bank
Customer Services, Overdrawn Accounts Team

Ms. Yasmin Kareem Adel
Flat 12, 8 Harbour View, Alexandria
Customer ID: CU-7741920

Date: 10 November 2026
Account number: 0123 4567 8901 2345
Account type: Current account

Dear Ms. Adel,

Your current account has been overdrawn since 2 November 2026. The balance is now minus EGP 2,340.75.

Charges applied so far:
- Unarranged overdraft fee: EGP 150.00
- Returned direct debit fee (2 items at EGP 75.00): EGP 150.00
- Daily overdraft interest (estimated): EGP 18.40

Total owed: EGP 2,659.15

Please repay at least EGP 2,000.00 by 24 November 2026 to avoid further fees and a possible referral to our collections team. If we do not hear from you by that date, we may also restrict your card and cheque facilities.

You can call us on 0800 555 0100 or visit any branch with a valid ID.

Yours sincerely,
Customer Services, Northgate Bank`,
  },
]
