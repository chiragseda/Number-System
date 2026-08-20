/* ============================================================
   BK JEWELLERS - PART PAYMENT
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


  // ==========================================================
  // OPEN PART PAYMENT
  // ==========================================================

  function openPartPayment(
    serialNo,
    button
  ) {

    const amountText =
      prompt(
        `Part Payment\n\nSerial No. ${serialNo}\n\nEnter payment amount:`
      );


    // User cancelled.
    if (
      amountText === null
    ) {

      return;

    }


    // Remove commas and spaces before converting.
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
        "Please enter a valid payment amount."
      );

      return;

    }


    // Confirm before changing the sheet.
    const confirmed =
      confirm(
        `Add Part Payment of ₹${formatIndianCurrency(amount)}/-?`
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
    // SEND PAYMENT TO GOOGLE APPS SCRIPT
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
            "addPartPayment",

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
        result => {

          let data;


          // Parse JSON safely.
          try {

            data =
              JSON.parse(
                result.text
              );

          } catch (error) {

            throw new Error(
              "The server returned an invalid response."
            );

          }


          // Check backend response.
          if (
            !result.ok ||
            !data.success
          ) {

            throw new Error(
              data.message ||
              "Unable to add part payment."
            );

          }


          // Update the visible record.
          updatePaymentField(
            data.value
          );


          alert(
            `Part Payment of ₹${formatIndianCurrency(amount)}/- added successfully.`
          );

        }
      )


      .catch(
        error => {

          console.error(
            "Part payment error:",
            error
          );


          alert(
            "Unable to add part payment.\n\n" +
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
              "Part Payment";

          }

        }
      );

  }


  // ==========================================================
  // UPDATE P.PMT FIELD ON SCREEN
  // ==========================================================

  function updatePaymentField(
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
            label.textContent.trim() ===
              "P.Pmt"
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

  window.openPartPayment =
    openPartPayment;


  // ==========================================================
  // BUTTON CLICK HANDLER
  // ==========================================================

  document.addEventListener(
    "click",
    event => {

      const button =
        event.target.closest(
          ".part-payment-btn"
        );


      if (!button) {

        return;

      }


      openPartPayment(
        button.dataset.serial,
        button
      );

    }
  );

})();