"""moneylog — 터미널 가계부. 메뉴를 보여 주고 각 기능을 호출한다.""" 
  
 def main(): 
    while True: 
        print("\n=== moneylog ===") 
        print("1. 거래 입력   2. 월별 통계   3. 예산 관리   4. 그래프 저장   0. 종료") 
        choice = input("선택: ").strip() 
        if choice == "0": 
            break 
        elif choice == "1": 
            print("준비 중 (담당: 홍길동, #3)")   # 기능이 완성되면 add.run() 으로 교체 
        elif choice == "2": 
            print("준비 중 (담당: 김철수, #4)") 
        elif choice == "3": 
            print("준비 중 (담당: 이영희, #5)") 
        elif choice == "4": 
            print("준비 중 (담당: 박민수, #6)") 
        else: 
            print("0~4 중에서 선택하세요.") 
  
  
if __name__ == "__main__": 
    main() 

// 추후 수정 예정.
