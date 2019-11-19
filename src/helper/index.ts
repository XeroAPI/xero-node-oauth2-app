export default class helper {
  public static getRandomNumber() {
    return Math.round(Math.random() * (100000 - 1) + 1);
  }
}
