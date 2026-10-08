/* ============================================================
   BK JEWELLERS - EXTRA AMOUNT
   ============================================================ */

(() => {

  const API_URL =
    "https://script.google.com/macros/s/AKfycbzPBNfn0u6rUXTT0My6bfkUvXHw1FxgP_xEoF6WfO_UZ4RPAQerewdLhG7QH8ESo6Jx/exec";


  // ==========================================================
  // FORMAT INDIAN CURRENCY
  // ==========================================================

  function formatIndianCurrency(amount) {

    return new Intl.NumberFormat(
      "en-IN",
      {
        maximumFractionDigits: 0
      }
    ).format(
      Number(amount) || 0
    );

  }


  const SHEET_ID =
    "1kP8Iwh5lCnEGvVxLP1vxCy0mJWO34BW9FKBg4ZSXAf8";

  const SHEET_API_KEY =
    "AIzaSyAwe-nAyIphZ47DgK5din3JoqADod5sVLk";

  const SHEET_RANGE =
    "Sheet1!A:M";

  function sumAmounts(value) {
    const matches =
      String(value || "").match(/\d+(?:,\d+)*(?:\.\d+)?/g) || [];

    return matches.reduce(
      (total, part) =>
        total + (Number(String(part).replace(/,/g, "")) || 0),
      0
    );
  }

  async function getSheetValue(serialNo, columnIndex, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        const response = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_RANGE}?key=${SHEET_API_KEY}&_=${Date.now()}`,
          { cache: "no-store" }
        );

        if (!response.ok) continue;

        const data = await response.json();
        const rows = data && data.values ? data.values.slice(1) : [];
        const row = rows.find(item =>
          String(item[0] || "").trim() === String(serialNo || "").trim()
        );

        if (row) return row[columnIndex] || "";
      } catch (error) {
        console.warn(`Sheet verification attempt ${attempt} failed:`, error);
      }
    }

    return null;
  }

  async function verifyExtraAmount(serialNo, amount, beforeValue) {
    const afterValue = await getSheetValue(serialNo, 8); // I = Other

    if (afterValue === null) return false;

    const beforeTotal = sumAmounts(beforeValue);
    const afterTotal = sumAmounts(afterValue);

    return afterTotal >= beforeTotal + Number(amount || 0);
  }


  // ==========================================================
  // OPEN EXTRA AMOUNT
  // ==========================================================

  async function openExtraAmount(
    serialNo,
    button
  ) {

    const amountText =
      prompt(
        `Extra Amount\n\nSerial No. ${serialNo}\n\nEnter extra amount:`
      );


    // User cancelled.
    if (
      amountText === null
    ) {

      return;

    }


    // Remove commas and spaces.
    const amount =
      Number(
        String(amountText)
          .replace(/,/g, "")
          .trim()
      );


    // Validate amount.
    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {

      alert(
        "Please enter a valid extra amount."
      );

      return;

    }


    // Confirm before changing the sheet.
    const confirmed =
      confirm(
        `Add Extra Amount of ₹${formatIndianCurrency(amount)}/-?`
      );


    if (!confirmed) {

      return;

    }


    // Temporarily disable button.
    const originalText =
      button
        ? button.textContent
        : "";


    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Adding...";

    }


    // ========================================================
    // SNAPSHOT CURRENT VALUE FOR SAFE VERIFICATION
    // ========================================================

    const beforeExtraValue =
      await getSheetValue(
        serialNo,
        8,
        1
      );

    // ========================================================
    // SEND EXTRA AMOUNT TO GOOGLE APPS SCRIPT
    // ========================================================

    fetch(
      API_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "text/plain;charset=utf-8"
        },

        body: JSON.stringify({

          action:
            "addExtraAmount",

          serialNo:
            String(serialNo).trim(),

          amount:
            amount

        })

      }
    )

      .then(
        response =>
          response.text()
            .then(text => ({

              ok:
                response.ok,

              text:
                text

            }))
      )


      .then(
        async result => {

          let data;


          // Parse JSON safely.
          try {

            data =
              JSON.parse(
                result.text
              );

          } catch (error) {

            const verified =
              await verifyExtraAmount(
                serialNo,
                amount,
                beforeExtraValue
              );

            if (verified) {
              data = {
                success: true,
                value: await getSheetValue(serialNo, 8, 1)
              };
            } else {
              throw new Error(
                "The server response was unclear and the extra amount could not be verified in Google Sheets."
              );
            }

          }


          // Check backend response.
          if (
            !result.ok ||
            !data.success
          ) {

            const verified =
              await verifyExtraAmount(
                serialNo,
                amount,
                beforeExtraValue
              );

            if (verified) {
              data = {
                success: true,
                value: await getSheetValue(serialNo, 8, 1)
              };
            } else {
              throw new Error(
                data.message ||
                "Unable to add extra amount."
              );
            }

          }


          // Update the visible record.
          updateExtraField(
            data.value
          );


          alert(
            `Extra Amount of ₹${formatIndianCurrency(amount)}/- added successfully.`
          );

        }
      )


      .catch(
        error => {

          console.error(
            "Extra amount error:",
            error
          );


          alert(
            "Unable to add extra amount.\n\n" +
            (
              error.message ||
              error
            )
          );

        }
      )


      .finally(
        () => {

          if (button) {

            button.disabled =
              false;

            button.textContent =
              originalText ||
              "Extra Amount";

          }

        }
      );

  }


  // ==========================================================
  // UPDATE OTHER / EXTRA FIELD ON SCREEN
  // ==========================================================

  function updateExtraField(
    value
  ) {

    document
      .querySelectorAll(
        ".record-card .field"
      )
      .forEach(
        field => {

          const label =
            field.querySelector(
              ".label"
            );


          if (
            label &&
            (
              label.textContent.trim() ===
                "ਹੋਰ" ||
              label.textContent.trim() ===
                "Other"
            )
          ) {

            const valueElement =
              field.querySelector(
                ".value"
              );


            if (valueElement) {

              valueElement.textContent =
                value || "-";

            }

          }

        }
      );

  }


  // ==========================================================
  // MAKE FUNCTION AVAILABLE GLOBALLY
  // ==========================================================

  window.openExtraAmount =
    openExtraAmount;


  // ==========================================================
  // BUTTON CLICK HANDLER
  // ==========================================================

  document.addEventListener(
    "click",
    event => {

      const button =
        event.target.closest(
          ".extra-amount-btn"
        );


      if (!button) {

        return;

      }


      openExtraAmount(
        button.dataset.serial,
        button
      );

    }
  );

})();