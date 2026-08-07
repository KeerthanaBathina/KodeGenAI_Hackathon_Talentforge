import Brevo from "@getbrevo/brevo";

const apiInstance = new Brevo.TransactionalEmailsApi();

apiInstance.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

export async function sendEmail(to, subject, htmlContent) {
  const email = {
    sender: {
      name: "Recruitment Portal",
      email: "mahasri.kanini@gmail.com"
    },
    to: [
      {
        email: to
      }
    ],
    subject,
    htmlContent
  };

  try {
    const response = await apiInstance.sendTransacEmail(email);
    console.log(response);
  } catch (err) {
    console.error(err);
  }
}