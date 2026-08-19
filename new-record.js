/* ============================================================
   BK JEWELLERS - NEW RECORD SYSTEM
   ============================================================

   IMPORTANT:
   This is a NEW standalone file.

   It does NOT modify the existing:
   - Search system
   - Interest calculation
   - Part payments
   - WhatsApp
   - Taken system

   It only handles:
   - New Record form
   - Saving new record
   - Amount in words
   - Printing two slips
   ============================================================ */


(() => {

  // ==========================================================
  // CONFIGURATION
  // ==========================================================

  const NEW_RECORD_API_URL =
    "https://script.google.com/macros/s/AKfycbzPBNfn0u6rUXTT0My6bfkUvXHw1FxgP_xEoF6WfO_UZ4RPAQerewdLhG7QH8ESo6Jx/exec";


  const DEFAULT_INTEREST =
    "2%";


  // ==========================================================
  // ELEMENTS
  // ==========================================================

  let newRecordModal;
  let newRecordForm;

  let openNewRecordBtn;
  let closeNewRecordModal;
  let cancelNewRecordBtn;

  let newSerial;
  let newDate;

  let newCustomerName;
  let newRelation;
  let newRelatedName;

  let newAddress;
  let newItem;

  let newAmount;
  let newInterest;

  let newPureGoldWeight;
  let newEstimatedWeight;

  let newPhone;

  let amountWordsPreview;

  let saveNewRecordBtn;

  // Background serial request.
  // It starts when the New Record system initializes so the serial
  // is normally ready before the user opens the form.
  let nextSerialPromise = null;


  // ==========================================================
  // INITIALIZE
  // ==========================================================

  function initNewRecordSystem() {

    newRecordModal =
      document.getElementById(
        "newRecordModal"
      );

    newRecordForm =
      document.getElementById(
        "newRecordForm"
      );

    openNewRecordBtn =
      document.getElementById(
        "openNewRecordBtn"
      );

    closeNewRecordModal =
      document.getElementById(
        "closeNewRecordModal"
      );

    cancelNewRecordBtn =
      document.getElementById(
        "cancelNewRecordBtn"
      );

    newSerial =
      document.getElementById(
        "newSerial"
      );

    newDate =
      document.getElementById(
        "newDate"
      );

    newCustomerName =
      document.getElementById(
        "newCustomerName"
      );

    newRelation =
      document.getElementById(
        "newRelation"
      );

    newRelatedName =
      document.getElementById(
        "newRelatedName"
      );

    newAddress =
      document.getElementById(
        "newAddress"
      );

    newItem =
      document.getElementById(
        "newItem"
      );

    newAmount =
      document.getElementById(
        "newAmount"
      );

    newInterest =
      document.getElementById(
        "newInterest"
      );

    newPureGoldWeight =
      document.getElementById(
        "newPureGoldWeight"
      );

    newEstimatedWeight =
      document.getElementById(
        "newEstimatedWeight"
      );

    newPhone =
      document.getElementById(
        "newPhone"
      );

    amountWordsPreview =
      document.getElementById(
        "amountWordsPreview"
      );

    saveNewRecordBtn =
      document.getElementById(
        "saveNewRecordBtn"
      );


    if (!newRecordModal || !newRecordForm) {

      console.error(
        "New Record system could not find required HTML elements."
      );

      return;

    }


    // ========================================================
    // OPEN
    // ========================================================

    if (openNewRecordBtn) {

      openNewRecordBtn.onclick =
        openNewRecord;

    }


    // ========================================================
    // CLOSE
    // ========================================================

    if (closeNewRecordModal) {

      closeNewRecordModal.onclick =
        closeNewRecord;

    }


    if (cancelNewRecordBtn) {

      cancelNewRecordBtn.onclick =
        closeNewRecord;

    }


    // ========================================================
    // CLICK OUTSIDE
    // ========================================================

    newRecordModal.addEventListener(
      "click",
      event => {

        if (
          event.target ===
          newRecordModal
        ) {

          closeNewRecord();

        }

      }
    );


    // ========================================================
    // FORM SUBMIT
    // ========================================================

    newRecordForm.addEventListener(
      "submit",
      handleNewRecordSubmit
    );


    // ========================================================
    // AMOUNT WORDS
    // ========================================================

    if (newAmount) {

      newAmount.addEventListener(
        "input",
        updateAmountWords
      );

    }


    // ========================================================
    // DEFAULT INTEREST
    // ========================================================

    if (newInterest) {

      newInterest.value =
        DEFAULT_INTEREST;

    }


    // Start the serial request immediately in the background.
    // The user does not have to wait for Google Apps Script when
    // opening the form.
    preloadNextSerial();


    console.log(
      "New Record system initialized."
    );

  }


  // ==========================================================
  // OPEN NEW RECORD
  // ==========================================================

  async function openNewRecord() {

    if (!newRecordModal) return;


    resetNewRecordForm();


    newRecordModal.style.display =
      "flex";

    // The serial request is normally already running in the background.
    // This prevents every click on New Record from starting a fresh
    // Google Apps Script request.
    if (!nextSerialPromise) {
      preloadNextSerial();
    }

    try {

      const data =
        await nextSerialPromise;


      if (
        data &&
        data.success &&
        data.nextSerial
      ) {

        newSerial.value =
          data.nextSerial;

      } else {

        newSerial.value =
          "Unable to load";

        alert(
          data && data.message
            ? data.message
            : "Unable to get next serial number."
        );

      }

    } catch (error) {

      console.error(
        "Next serial error:",
        error
      );

      newSerial.value =
        "Unable to load";

      alert(
        "Unable to get the next serial number.\n\n" +
        (error.message || error)
      );

      // Allow the next opening to retry.
      nextSerialPromise = null;

    }

  }


  // ==========================================================
  // BACKGROUND SERIAL PRELOAD
  // ==========================================================

  function preloadNextSerial() {

    if (nextSerialPromise) {
      return nextSerialPromise;
    }

    nextSerialPromise =
      fetchNextSerialWithRetry(
        2,
        350
      );

    // If the background request fails, clear it so a later
    // opening can make a fresh request.
    nextSerialPromise.catch(() => {
      nextSerialPromise = null;
    });

    return nextSerialPromise;

  }


  // ==========================================================
  // FETCH NEXT SERIAL WITH SAFE RETRY
  // ==========================================================

  async function fetchNextSerialWithRetry(
    maxAttempts = 3,
    retryDelay = 700
  ) {

    let lastError =
      new Error(
        "Unable to get next serial number."
      );

    for (
      let attempt = 1;
      attempt <= maxAttempts;
      attempt++
    ) {

      try {

        const response =
          await fetch(
            NEW_RECORD_API_URL,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "text/plain;charset=utf-8"
              },

              body: JSON.stringify({
                action:
                  "getNextSerial"
              })
            }
          );


        // Read response as text first.
        // This prevents the "Unexpected token '<'"
        // error when Google returns an HTML page.

        const responseText =
          await response.text();


        let data;


        try {

          data =
            JSON.parse(
              responseText
            );

        } catch (parseError) {

          lastError =
            new Error(
              "The server returned an invalid response."
            );


          console.warn(
            `Next serial attempt ${attempt}/${maxAttempts} returned non-JSON data.`,
            responseText
              ? responseText.substring(0, 200)
              : "(empty response)"
          );


          if (
            attempt < maxAttempts
          ) {

            await wait(
              retryDelay * attempt
            );

            continue;

          }


          throw lastError;

        }


        return data;

      } catch (error) {

        lastError =
          error instanceof Error
            ? error
            : new Error(
                String(error)
              );


        if (
          attempt < maxAttempts
        ) {

          console.warn(
            `Next serial request failed. Retrying ${attempt + 1}/${maxAttempts}...`,
            lastError
          );


          await wait(
            retryDelay * attempt
          );


          continue;

        }


        throw lastError;

      }

    }


    throw lastError;

  }


  // ==========================================================
  // RETRY DELAY
  // ==========================================================

  function wait(milliseconds) {

    return new Promise(
      resolve =>
        setTimeout(
          resolve,
          milliseconds
        )
    );

  }

  // ==========================================================
  // CLOSE
  // ==========================================================

  function closeNewRecord() {

    if (!newRecordModal) return;

    newRecordModal.style.display =
      "none";

  }


  // ==========================================================
  // RESET FORM
  // ==========================================================

  function resetNewRecordForm() {

    if (!newRecordForm) return;


    newRecordForm.reset();


    // Today's date.

    const today =
      new Date();


    newDate.value =
      formatDateForDisplay(
        today
      );


    // Default interest.

    newInterest.value =
      DEFAULT_INTEREST;


    // Reset amount words.

    amountWordsPreview.textContent =
      "—";


    // Serial is loaded
    // separately from backend.

    newSerial.value =
      "Loading...";

  }


  // ==========================================================
  // DATE
  // ==========================================================

  function formatDateForDisplay(date) {

    const day =
      String(
        date.getDate()
      ).padStart(
        2,
        "0"
      );


    const month =
      String(
        date.getMonth() + 1
      ).padStart(
        2,
        "0"
      );


    const year =
      date.getFullYear();


    return `${day}/${month}/${year}`;

  }


  // ==========================================================
  // AMOUNT WORDS
  // ==========================================================

  function updateAmountWords() {

    const amount =
      Number(
        newAmount.value
      );


    if (
      !amount ||
      amount < 0
    ) {

      amountWordsPreview.textContent =
        "—";

      return;

    }


    amountWordsPreview.textContent =
      numberToIndianWords(
        amount
      ) +
      " Only";

  }


  // ==========================================================
  // INDIAN NUMBER TO WORDS
  // ==========================================================

  function numberToIndianWords(number) {

    number =
      Math.floor(
        Number(number)
      );


    if (
      !Number.isFinite(number) ||
      number < 0
    ) {

      return "";

    }


    if (number === 0) {

      return "Zero";

    }


    const ones = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen"
    ];


    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety"
    ];


    function underHundred(n) {

      if (n < 20) {

        return ones[n];

      }


      const ten =
        Math.floor(
          n / 10
        );

      const remainder =
        n % 10;


      return (
        tens[ten] +
        (
          remainder
            ? " " + ones[remainder]
            : ""
        )
      );

    }


    function underThousand(n) {

      if (n < 100) {

        return underHundred(n);

      }


      const hundred =
        Math.floor(
          n / 100
        );


      const remainder =
        n % 100;


      return (
        ones[hundred] +
        " Hundred" +
        (
          remainder
            ? " " +
              underHundred(
                remainder
              )
            : ""
        )
      );

    }


    let result = "";


    const crore =
      Math.floor(
        number / 10000000
      );


    number =
      number % 10000000;


    const lakh =
      Math.floor(
        number / 100000
      );


    number =
      number % 100000;


    const thousand =
      Math.floor(
        number / 1000
      );


    number =
      number % 1000;


    if (crore) {

      result +=
        underThousand(crore) +
        " Crore ";

    }


    if (lakh) {

      result +=
        underThousand(lakh) +
        " Lakh ";

    }


    if (thousand) {

      result +=
        underThousand(thousand) +
        " Thousand ";

    }


    if (number) {

      result +=
        underThousand(number);

    }


    return result.trim();

  }


  // ==========================================================
  // BUILD CUSTOMER NAME
  // ==========================================================

  function buildCustomerName() {

    const name =
      String(
        newCustomerName.value ||
        ""
      ).trim();


    const relation =
      String(
        newRelation.value ||
        ""
      ).trim();


    const relatedName =
      String(
        newRelatedName.value ||
        ""
      ).trim();


    let result =
      name;


    if (
      relation &&
      relatedName
    ) {

      result +=
        " " +
        relation +
        " " +
        relatedName;

    }


    return result.trim();

  }


  // ==========================================================
  // VALIDATE PHONE
  // ==========================================================

  function validatePhone(phone) {

    const digits =
      String(phone || "")
        .replace(
          /\D/g,
          ""
        );


    return (
      digits.length === 10 ||
      (
        digits.length === 12 &&
        digits.startsWith("91")
      )
    );

  }


  // ==========================================================
  // SUBMIT
  // ==========================================================

  async function handleNewRecordSubmit(event) {

    event.preventDefault();


    // --------------------------------------------------------
    // READ VALUES
    // --------------------------------------------------------

    const serial =
      String(
        newSerial.value ||
        ""
      ).trim();


    const date =
      String(
        newDate.value ||
        ""
      ).trim();


    const customerName =
      buildCustomerName();


    const address =
      String(
        newAddress.value ||
        ""
      ).trim();


    const item =
      String(
        newItem.value ||
        ""
      ).trim();


    const amount =
      Number(
        newAmount.value
      );


    const pureGoldWeight =
      String(
        newPureGoldWeight.value ||
        ""
      ).trim();


    const estimatedWeight =
      String(
        newEstimatedWeight.value ||
        ""
      ).trim();


    const phone =
      String(
        newPhone.value ||
        ""
      ).trim();


    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (!serial || serial === "Loading...") {

      alert(
        "Serial number is not ready yet."
      );

      return;

    }


    if (!customerName) {

      alert(
        "Please enter customer name."
      );

      newCustomerName.focus();

      return;

    }


    if (!address) {

      alert(
        "Please enter address."
      );

      newAddress.focus();

      return;

    }


    if (!item) {

      alert(
        "Please enter item."
      );

      newItem.focus();

      return;

    }


    if (
      !amount ||
      amount <= 0
    ) {

      alert(
        "Please enter a valid amount."
      );

      newAmount.focus();

      return;

    }


    if (!pureGoldWeight) {

      alert(
        "Please enter pure gold weight."
      );

      newPureGoldWeight.focus();

      return;

    }


    if (!estimatedWeight) {

      alert(
        "Please enter estimated weight."
      );

      newEstimatedWeight.focus();

      return;

    }


    if (!validatePhone(phone)) {

      alert(
        "Please enter a valid 10-digit phone number."
      );

      newPhone.focus();

      return;

    }


    // --------------------------------------------------------
    // CONFIRM
    // --------------------------------------------------------

    const confirmed =
      confirm(
        "Save this new record and print the two slips?"
      );


    if (!confirmed) {

      return;

    }


    // --------------------------------------------------------
    // DISABLE BUTTON
    // --------------------------------------------------------

    const originalButtonText =
      saveNewRecordBtn.textContent;


    saveNewRecordBtn.disabled =
      true;


    saveNewRecordBtn.textContent =
      "Saving...";


    // --------------------------------------------------------
    // SEND TO GOOGLE APPS SCRIPT
    // --------------------------------------------------------

    try {

      const response =
        await fetch(
          NEW_RECORD_API_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "text/plain;charset=utf-8"
            },

            body: JSON.stringify({

              action:
                "addNewRecord",

              serialNo:
                serial,

              date:
                date,

              name:
                customerName,

              city:
                address,

              item:
                item,

              amount:
                amount,

              pureGoldWeight:
                pureGoldWeight,

              interest:
                DEFAULT_INTEREST,

              phone:
                phone

            })

          }
        );


      // Read the response as text first.
      // Google Apps Script can occasionally return an HTML page
      // even though the record has already been written.
      const responseText =
        await response.text();

      let data = null;

      try {

        data =
          JSON.parse(
            responseText
          );

      } catch (parseError) {

        console.warn(
          "Save response was not valid JSON. Verifying the record on the server...",
          responseText
            ? responseText.substring(0, 200)
            : "(empty response)"
        );

        // IMPORTANT:
        // Do NOT retry addNewRecord.
        // The record may already have been written.
        const verified =
          await verifySavedRecord(
            serial
          );

        if (
          verified &&
          verified.success &&
          verified.exists
        ) {

          data = {
            success: true,
            serialNo: serial,
            row: verified.row,
            message:
              "Record was saved successfully."
          };

        } else {

          throw new Error(
            "The server response was not valid JSON and the record could not be verified."
          );

        }

      }


      if (
        !response.ok ||
        !data ||
        !data.success
      ) {

        throw new Error(
          data && data.message
            ? data.message
            : "Unable to save the new record."
        );

      }


      // The record just saved used this serial. Keep the next serial
      // ready locally so opening New Record again is instant.
      const numericSavedSerial =
        Number(serial);

      if (
        Number.isSafeInteger(
          numericSavedSerial
        )
      ) {

        nextSerialPromise =
          Promise.resolve({
            success: true,
            nextSerial:
              numericSavedSerial + 1
          });

        // Refresh from the backend in the background so the local
        // value can be corrected if another device added a record.
        const refreshPromise =
          fetchNextSerialWithRetry(
            2,
            350
          );

        refreshPromise
          .then(data => {

            if (
              data &&
              data.success &&
              data.nextSerial
            ) {

              nextSerialPromise =
                Promise.resolve(data);

            }

          })
          .catch(error => {

            console.warn(
              "Background serial refresh failed:",
              error
            );

          });

      }


      // ------------------------------------------------------
      // UPDATE LOCAL CACHE IF AVAILABLE
      // ------------------------------------------------------

      /*
         We don't directly alter the existing search logic.

         If the existing script has cachedData,
         we only append the new row to that cache.
      */

      try {

        if (
          window.cachedData &&
          window.cachedData.values
        ) {

          window.cachedData.values.push([
            serial,
            date,
            customerName,
            address,
            item,
            String(amount),
            pureGoldWeight,
            DEFAULT_INTEREST,
            "",
            "",
            "",
            phone,
            ""
          ]);

        }

      } catch (cacheError) {

        console.warn(
          "Local cache was not updated:",
          cacheError
        );

      }


      // ------------------------------------------------------
      // PREPARE PRINT
      // ------------------------------------------------------

      const amountWords =
        numberToIndianWords(
          amount
        ) +
        " Only";


      fillPrintSlip({

        serial:
          serial,

        phone:
          phone,

        name:
          customerName,

        address:
          address,

        item:
          item,

        estimatedWeight:
          estimatedWeight,

        pureGoldWeight:
          pureGoldWeight,

        amount:
          formatIndianCurrency(
            amount
          ),

        date:
          date,

        amountWords:
          amountWords

      });


      // ------------------------------------------------------
      // CLOSE FORM
      // ------------------------------------------------------

      closeNewRecord();


      // ------------------------------------------------------
      // PRINT
      // ------------------------------------------------------

      setTimeout(
        () => {

          window.print();

        },
        250
      );


      // ------------------------------------------------------
      // SUCCESS
      // ------------------------------------------------------

      alert(
        `Record ${serial} saved successfully.`
      );


    } catch (error) {

      console.error(
        "New record error:",
        error
      );


      alert(
        "Unable to save the new record.\n\n" +
        (error.message || error)
      );


    } finally {

      saveNewRecordBtn.disabled =
        false;

      saveNewRecordBtn.textContent =
        originalButtonText;

    }

  }


  // ==========================================================
  // VERIFY SAVED RECORD
  // ==========================================================
  //
  // Used only when the add-record request appears to have
  // succeeded on Google Sheets but the browser receives an
  // unexpected HTML response instead of JSON.
  //
  // IMPORTANT:
  // This function NEVER retries the save request.
  // It only checks whether the serial already exists.
  // ==========================================================

  async function verifySavedRecord(serial) {

    try {

      const response =
        await fetch(
          NEW_RECORD_API_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "text/plain;charset=utf-8"
            },

            body: JSON.stringify({
              action:
                "verifyRecord",
              serialNo:
                String(serial || "").trim()
            })
          }
        );


      const responseText =
        await response.text();


      let data;

      try {

        data =
          JSON.parse(
            responseText
          );

      } catch (parseError) {

        console.error(
          "Verify response was not valid JSON:",
          responseText
            ? responseText.substring(0, 200)
            : "(empty response)"
        );

        return {
          success: false,
          exists: false
        };

      }


      return data;

    } catch (error) {

      console.error(
        "Unable to verify saved record:",
        error
      );

      return {
        success: false,
        exists: false
      };

    }

  }


  // ==========================================================
  // FORMAT CURRENCY
  // ==========================================================

  function formatIndianCurrency(amount) {

    const number =
      Number(amount) || 0;


    return number.toLocaleString(
      "en-IN"
    ) + "/-";

  }


  // ==========================================================
  // FILL PRINT SLIPS
  // ==========================================================

  function fillPrintSlip(data) {

    // ========================================================
    // CUSTOMER COPY
    // ========================================================

    setText(
      "printSerialCustomer",
      data.serial
    );

    setText(
      "printPhoneCustomer",
      data.phone
    );

    setText(
      "printNameCustomer",
      data.name
    );

    setText(
      "printAddressCustomer",
      "(" +
      data.address +
      ")"
    );

    setText(
      "printItemCustomer",
      data.item
    );

    setText(
      "printEstimatedWeightCustomer",
      data.estimatedWeight
    );

    setText(
      "printGoldWeightCustomer",
      data.pureGoldWeight
    );

    setText(
      "printAmountCustomer",
      data.amount
    );

    setText(
      "printDateCustomer",
      data.date
    );

    setText(
      "printAmountWordsCustomer",
      data.amountWords
    );


    // ========================================================
    // OFFICE COPY
    // ========================================================

    setText(
      "printSerialOffice",
      data.serial
    );

    setText(
      "printPhoneOffice",
      data.phone
    );

    setText(
      "printNameOffice",
      data.name
    );

    setText(
      "printAddressOffice",
      "(" +
      data.address +
      ")"
    );

    setText(
      "printItemOffice",
      data.item
    );

    setText(
      "printEstimatedWeightOffice",
      data.estimatedWeight
    );

    setText(
      "printGoldWeightOffice",
      data.pureGoldWeight
    );

    setText(
      "printAmountOffice",
      data.amount
    );

    setText(
      "printDateOffice",
      data.date
    );

    setText(
      "printAmountWordsOffice",
      data.amountWords
    );

  }


  // ==========================================================
  // SAFE TEXT SETTER
  // ==========================================================

  function setText(
    id,
    value
  ) {

    const element =
      document.getElementById(
        id
      );


    if (!element) return;


    element.textContent =
      value == null
        ? ""
        : String(value);

  }


  // ==========================================================
  // DOM READY
  // ==========================================================

  document.addEventListener(
    "DOMContentLoaded",
    initNewRecordSystem
  );


})();