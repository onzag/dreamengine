// Initialize stars when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  const nightsky = ["#280F36", "#632B6C", "#BE6590", "#FFC1A0", "#FE9C7F"];

  const star0 = "<div class='star star-0' style='top:{{top}}vh;left:{{left}}vw;animation-duration:{{duration}}s;'></div>";
  const star1 = "<div class='star star-1 blink' style='top:{{top}}vh;left:{{left}}vw;animation-duration:{{duration}}s;'></div>";
  const star2 = "<div class='star star-2 blink' style='top:{{top}}vh;left:{{left}}vw;animation-duration:{{duration}}s;'></div>";
  const star3 = "<div class='star star-3' style='top:{{top}}vh;left:{{left}}vw;animation-duration:{{duration}}s;'></div>";
  const star4 = "<div class='star star-4 blink' style='top:{{top}}vh;left:{{left}}vw;animation-duration:{{duration}}s;'></div>";
  const star5 = "<div class='star star-5' style='top:{{top}}vh;left:{{left}}vw;animation-duration:{{duration}}s;background-color:{{color}}'></div>";
  const star1pt = "<div class='star star-1 blink' style='top:{{top}}%;left:{{left}}%;animation-duration:{{duration}}s;background-color:{{color}};box-shadow:0px 0px 6px 1px {{shadow}}'></div>";
  const star2pt = "<div class='star star-2' style='top:{{top}}%;left:{{left}}%;animation-duration:{{duration}}s;background-color:{{color}};box-shadow:0px 0px 10px 1px {{shadow}};opacity:0.7'></div>";
  const blur = "<div class='blur' style='top:{{top}}%;left:{{left}}%;background-color:{{color}}'></div>";

  const starsContainer = document.querySelector(".stars");
  const starsCrossContainer = document.querySelector(".stars-cross");
  const starsCrossAuxContainer = document.querySelector(".stars-cross-aux");

  // Helper function to add HTML to container
  /**
   * 
   * @param {Element | null} container 
   * @param {string} html 
   */
  function addStarToContainer(container, html) {
    if (container) {
      container.insertAdjacentHTML('beforeend', html);
    }
  }

  // First loop - 500 iterations
  for (let i = 0; i < 500; i++) {
    addStarToContainer(starsContainer, 
      star1
        .replace("{{top}}", getRandomInt(0, 40))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(2, 5)))
    );

    addStarToContainer(starsContainer,
      star2
        .replace("{{top}}", getRandomInt(20, 70))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(4, 8)))
    );
  }

  // Second loop - 150 iterations
  for (let i = 0; i < 150; i++) {
    addStarToContainer(starsContainer,
      star0
        .replace("{{top}}", getRandomInt(0, 50))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(1, 2.5)))
    );

    addStarToContainer(starsContainer,
      star1
        .replace("{{top}}", getRandomInt(0, 50))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(2.5, 4)))
    );

    addStarToContainer(starsContainer,
      star2
        .replace("{{top}}", getRandomInt(0, 50))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(4, 5)))
    );
  }

  // Third loop - 100 iterations
  for (let i = 0; i < 100; i++) {
    addStarToContainer(starsContainer,
      star0
        .replace("{{top}}", getRandomInt(40, 75))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(1, 3)))
    );

    addStarToContainer(starsContainer,
      star1
        .replace("{{top}}", getRandomInt(40, 75))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(2, 4)))
    );
  }

  // Fourth loop - 250 iterations
  for (let i = 0; i < 250; i++) {
    addStarToContainer(starsContainer,
      star0
        .replace("{{top}}", getRandomInt(0, 100))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(1, 2)))
    );

    addStarToContainer(starsContainer,
      star1
        .replace("{{top}}", getRandomInt(0, 100))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(2, 5)))
    );

    addStarToContainer(starsContainer,
      star2
        .replace("{{top}}", getRandomInt(0, 100))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(1, 4)))
    );

    addStarToContainer(starsContainer,
      star4
        .replace("{{top}}", getRandomInt(0, 70))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(5, 7)))
    );
  }

  // Fifth loop - 150 iterations
  for (let i = 0; i < 150; i++) {
    addStarToContainer(starsContainer,
      star4
        .replace("{{top}}", getRandomInt(0, 100))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(5, 7)))
    );

    addStarToContainer(starsCrossContainer,
      blur
        .replace("{{top}}", getRandomInt(0, 100))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{color}}", nightsky[Math.ceil(getRandomInt(0, nightsky.length - 1))])
    );

    addStarToContainer(starsCrossContainer,
      star1pt
        .replace("{{top}}", getRandomInt(0, 100))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(6, 12)))
        .replace("{{color}}", nightsky[Math.ceil(getRandomInt(0, nightsky.length - 1))])
        .replace("{{shadow}}", nightsky[Math.ceil(getRandomInt(0, nightsky.length - 1))])
    );
  }

  // Sixth loop - 50 iterations
  for (let i = 0; i < 50; i++) {
    if (i % 2 === 0) {
      addStarToContainer(starsContainer,
        star5
          .replace("{{top}}", getRandomInt(0, 50))
          .replace("{{left}}", getRandomInt(0, 100))
          .replace("{{duration}}", roundToOneDecimal(getRandomInt(5, 7)))
          .replace("{{color}}", nightsky[Math.ceil(getRandomInt(0, nightsky.length - 1))])
      );
    }

    addStarToContainer(starsCrossAuxContainer,
      blur
        .replace("{{top}}", getRandomInt(0, 100))
        .replace("{{left}}", roundToOneDecimal(getRandomInt(0, 100)))
        .replace("{{color}}", nightsky[Math.ceil(getRandomInt(0, nightsky.length - 1))])
    );

    addStarToContainer(starsCrossAuxContainer,
      star2pt
        .replace("{{top}}", getRandomInt(0, 100))
        .replace("{{left}}", getRandomInt(0, 100))
        .replace("{{duration}}", roundToOneDecimal(getRandomInt(4, 10)))
        .replace("{{color}}", nightsky[Math.ceil(getRandomInt(0, nightsky.length - 1))])
        .replace("{{shadow}}", nightsky[Math.ceil(getRandomInt(0, nightsky.length - 1))])
    );
  }
});

/**
 * 
 * @param {number} num 
 * @returns {any}
 */
function roundToOneDecimal(num) {
  return Math.round(num * 10) / 10;
}

/**
 * 
 * @param {number} min 
 * @param {number} max 
 * @returns {any}
 */
function getRandomInt(min, max) {
  return Math.random() * (max - min) + min;
}
