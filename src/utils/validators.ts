import validator from 'validator';

export const validateUserContact = (email: string, phone: string) => {
  const isEmailValid = validator.isEmail(email);
  // Philippine Mobile Number check (e.g., 09123456789 or +639...)
  const isPhoneValid = validator.isMobilePhone(phone, 'en-PH');

  return { isEmailValid, isPhoneValid };
};