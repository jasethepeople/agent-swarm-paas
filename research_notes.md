# External Integration Notes

## Resend invitation delivery

The official Resend Send Email reference documents a `POST https://api.resend.com/emails` request. It requires a sender (`from`), recipient (`to`), and `subject`; it accepts both plain-text (`text`) and HTML (`html`) content. The response returns an email identifier that can be stored as the provider delivery reference. Source: [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email).
