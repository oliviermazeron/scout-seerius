// ─── Signature email Seerius — Olivier Mazeron ───────────────────────────────
// Deux fonctions pures, sans I/O, compatibles Vercel serverless.
// Tenir les deux versions synchronisées : mêmes coordonnées, même lien RDV.

export function signatureText() {
  return `Avec mes meilleures salutations,

Olivier Mazeron
Founding Partner — Seerius
Rue De-Candolle, 26 | CH-1205 Genève
olivier@seerius.ch | +41 79 171 11 42
Prendre rendez-vous : https://meetings-eu1.hubspot.com/olivier-mazeron`
}

export function signatureHtml() {
  return `<!-- === DEBUT SIGNATURE === -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;">
  <tr>
    <td style="padding:0 0 20px 0;">
      <a href="https://www.seerius.ch/" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;border:0;">
        <img src="https://147633255.fs1.hubspotusercontent-eu1.net/hubfs/147633255/SEERIUS_LOGO%2BBL_BLACK_TRANSPARENT.png"
             width="220" height="69" alt="Seerius — The Private Equity Gateway. Augmented."
             style="display:block;border:0;outline:none;text-decoration:none;width:220px;height:69px;">
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 16px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="220" style="border-collapse:collapse;width:220px;">
        <tr><td height="2" bgcolor="#BB6343" style="height:2px;line-height:2px;font-size:2px;background-color:#BB6343;">&nbsp;</td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:bold;color:#1A1A1A;padding:0 0 3px 0;line-height:24px;">
      Olivier Mazeron
    </td>
  </tr>
  <tr>
    <td style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15px;color:#555555;padding:0 0 16px 0;line-height:20px;">
      Founding Partner
    </td>
  </tr>
  <tr>
    <td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;color:#333333;padding:0 0 18px 0;">
      Rue De-Candolle, 26&nbsp;&nbsp;|&nbsp;&nbsp;CH-1205 Gen&egrave;ve<br>
      <a href="mailto:olivier@seerius.ch" style="color:#333333;text-decoration:none;"><span style="color:#333333;text-decoration:none;">olivier@seerius.ch</span></a><br>
      <a href="tel:+41791711142" style="color:#333333;text-decoration:none;"><span style="color:#333333;text-decoration:none;">+41 79 171 11 42</span></a>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 18px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td bgcolor="#1A1A1A" align="center" style="background-color:#1A1A1A;padding:11px 20px;">
            <a href="https://meetings-eu1.hubspot.com/olivier-mazeron" target="_blank" rel="noopener"
               style="color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:0.6px;text-decoration:none;display:inline-block;">
              PRENDRE RENDEZ-VOUS / SCHEDULE A MEETING
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 10px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td width="22" style="width:22px;padding:0 10px 0 0;" valign="middle">
            <a href="https://www.linkedin.com/company/www.seerius-ch/" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;border:0;">
              <img src="https://147633255.fs1.hubspotusercontent-eu1.net/hubfs/147633255/linkedin-icon-88.png"
                   width="22" height="22" alt="LinkedIn"
                   style="display:block;border:0;width:22px;height:22px;">
            </a>
          </td>
          <td valign="middle" style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;">
            <a href="https://www.linkedin.com/company/www.seerius-ch/" target="_blank" rel="noopener" style="color:#333333;text-decoration:none;"><span style="color:#333333;text-decoration:none;">Seerius on LinkedIn</span></a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 20px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td width="22" style="width:22px;padding:0 10px 0 0;" valign="middle">
            <a href="https://www.seerius.ch/enter-the-gateway" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;border:0;">
              <img src="https://147633255.fs1.hubspotusercontent-eu1.net/hubfs/147633255/Logo_S%5Bsolo%5D_noir.png"
                   width="22" height="22" alt="Seerius"
                   style="display:block;border:0;width:22px;height:22px;">
            </a>
          </td>
          <td valign="middle" style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;">
            <a href="https://www.seerius.ch/enter-the-gateway" target="_blank" rel="noopener" style="color:#333333;text-decoration:none;"><span style="color:#333333;text-decoration:none;">Enter the Gateway</span></a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 0 14px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="border-collapse:collapse;width:620px;max-width:100%;">
        <tr><td height="1" bgcolor="#E0E0E0" style="height:1px;line-height:1px;font-size:1px;background-color:#E0E0E0;">&nbsp;</td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="border-collapse:collapse;width:620px;max-width:100%;">
        <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:17px;color:#9C9C9C;">
          The contents of this e-mail are confidential and solely for the intended addressee(s) and may not be reproduced, passed on, or published. If the distribution of this e-mail in a jurisdiction, or to a person, is restricted by law, a recipient of this e-mail should observe any such restrictions. If you have received this email in error, please notify the sender immediately and delete it from your system. This e-mail must not be construed as an offer, an invitation or any other solicitation or an advice to invest, in any jurisdiction. Certain information in this e-mail was prepared based on information available from third parties or public sources. No person should act on the basis of or in reliance on, and no guarantee, representation or warranty, express or implied, is made as to the fairness, accuracy or completeness of the information, opinions and conclusions, or the performance of any potential investment, in this email. A decision to invest must be based on the definitive documentation and not on this e-mail which is subject to modification, may become out-of-date and does not contain all of the information necessary to adequately evaluate the consequences of an investment. The investment may expose investors to a risk of losing all of their investments. The views expressed in this message do not necessarily reflect those of the sender. To the maximum extent permitted by law, no person accepts any responsibility or liability whatsoever for defects of any nature in this transmission, or any direct or indirect loss, however arising from any use of this e-mail or its contents, or otherwise arising in connection therewith.
        </td></tr>
      </table>
    </td>
  </tr>
</table>
<!-- === FIN SIGNATURE === -->`
}
