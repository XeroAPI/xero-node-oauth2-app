export default class helper {
  public static getRandomNumber(range) {
    return Math.round(Math.random() * (range - 1) + 1);
  }
}
